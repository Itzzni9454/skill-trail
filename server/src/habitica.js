/**
 * Habitica API v3 Integration Client & Two-Way Sync Engine
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.js';
import { loadConnectors } from './connectors.js';

const HABITICA_API_BASE = 'https://habitica.com/api/v3';

export function getHabiticaCredentials() {
  const envUserId = process.env.HABITICA_USER_ID;
  const envApiKey = process.env.HABITICA_API_KEY;

  if (envUserId && envApiKey) {
    return { userId: envUserId.trim(), apiKey: envApiKey.trim() };
  }

  // Fallback to connectors.json
  const conn = loadConnectors()?.connectors?.habitica;
  if (conn?.userId && conn?.apiToken) {
    return { userId: conn.userId.trim(), apiKey: conn.apiToken.trim() };
  }

  return { userId: envUserId?.trim() || null, apiKey: envApiKey?.trim() || null };
}

export function isHabiticaConfigured() {
  const { userId, apiKey } = getHabiticaCredentials();
  return Boolean(userId && apiKey);
}

function getHeaders() {
  const { userId, apiKey } = getHabiticaCredentials();
  if (!userId || !apiKey) {
    throw new Error('Habitica User ID or API Key is missing. Please check .env or settings.');
  }
  return {
    'x-api-user': userId,
    'x-api-key': apiKey,
    'x-client': 'roadmap-offline-app',
    'Content-Type': 'application/json',
  };
}

async function request(endpoint, options = {}) {
  const url = `${HABITICA_API_BASE}${endpoint}`;
  const headers = { ...getHeaders(), ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, message: text };
  }

  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    throw new Error(`Habitica API error: ${msg}`);
  }

  return json?.data;
}

/**
 * Fetch Habitica user profile, RPG stats, and character information.
 */
export async function getProfile() {
  if (!isHabiticaConfigured()) {
    return { configured: false, error: 'Habitica credentials not configured' };
  }

  try {
    const data = await request('/user');
    const stats = data?.stats || {};
    const profile = data?.profile || {};
    const preferences = data?.preferences || {};

    return {
      configured: true,
      id: data?._id || data?.id,
      name: profile.name || 'Hero',
      username: data?.auth?.local?.username || profile.name,
      lvl: stats.lvl || 1,
      class: stats.class || 'warrior',
      hp: Math.round(stats.hp || 50),
      maxHealth: stats.maxHealth || 50,
      mp: Math.round(stats.mp || 10),
      maxMP: stats.maxMP || 10,
      exp: Math.round(stats.exp || 0),
      toNextLevel: stats.toNextLevel || 100,
      gp: Number((stats.gp || 0).toFixed(1)),
      hair: preferences.hair,
      costume: preferences.costume,
      skin: preferences.skin,
      shirt: preferences.shirt,
      background: preferences.background,
    };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

/**
 * Fetch user tags.
 */
export async function getTags() {
  return await request('/tags');
}

/**
 * Create a new tag if it doesn't already exist.
 */
export async function ensureTag(name) {
  const tags = (await getTags()) || [];
  const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;

  const created = await request('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return created?.id;
}

/**
 * Fetch tasks by type ('habits', 'dailys', 'todos').
 */
export async function getTasks(type = null) {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return (await request(`/tasks/user${query}`)) || [];
}

/**
 * Create a task (habit, daily, todo).
 */
export async function createTask({
  text,
  type = 'daily',
  notes = '',
  priority = 1.5,
  tags = [],
  frequency = 'daily',
  everyX = 1,
  up = true,
  down = false,
}) {
  const payload = {
    text,
    type,
    notes,
    priority: Number(priority) || 1.5,
    tags,
  };

  if (type === 'daily') {
    payload.frequency = frequency;
    payload.everyX = everyX;
  } else if (type === 'habit') {
    payload.up = up;
    payload.down = down;
  }

  return await request('/tasks/user', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Score a task (+ for up, - for down).
 */
export async function scoreTask(taskId, direction = 'up') {
  return await request(`/tasks/${encodeURIComponent(taskId)}/score/${direction}`, {
    method: 'POST',
  });
}

/**
 * Delete a task.
 */
export async function deleteTask(taskId) {
  return await request(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}

/**
 * The 7 required daily specifications:
 * 1. leetcode problem of the day, daily repeat, medium, tag- Leetcode
 * 2. leetcode random problem, daily, difficult, tag- Leetcode
 * 3. leetcode quest, daily, medium, tag- Leetcode
 * 4. leetcode study plan, daily, difficult, tag- Leetcode
 * 5. neetcode random, daily, medium, tag- Neetcode
 * 6. Project Euler, daily, medium, tag -Euler
 * 7. 4 roadmap topics, daily, hard, tag- Roadmap
 */
export const REQUIRED_DAILIES = [
  {
    key: 'lc-potd',
    text: 'leetcode problem of the day',
    type: 'daily',
    priority: 1.5, // medium
    tagName: 'Leetcode',
    frequency: 'daily',
    everyX: 1,
    notes: "LeetCode's official Problem of the Day.",
  },
  {
    key: 'lc-random',
    text: 'leetcode random problem',
    type: 'daily',
    priority: 2, // difficult/hard
    tagName: 'Leetcode',
    frequency: 'daily',
    everyX: 1,
    notes: 'A random free LeetCode problem.',
  },
  {
    key: 'lc-quest',
    text: 'leetcode quest',
    type: 'daily',
    priority: 1.5, // medium
    tagName: 'Leetcode',
    frequency: 'daily',
    everyX: 1,
    notes: 'A themed medium LeetCode challenge.',
  },
  {
    key: 'lc-studyplan',
    text: 'leetcode study plan',
    type: 'daily',
    priority: 2, // difficult/hard
    tagName: 'Leetcode',
    frequency: 'daily',
    everyX: 1,
    notes: 'Sequential problem from your LeetCode Study Plan.',
  },
  {
    key: 'nc-daily',
    text: 'neetcode random',
    type: 'daily',
    priority: 1.5, // medium
    tagName: 'Neetcode',
    frequency: 'daily',
    everyX: 1,
    notes: 'Random problem from NeetCode free problem pool.',
  },
  {
    key: 'euler-daily',
    text: 'Project Euler',
    type: 'daily',
    priority: 1.5, // medium
    tagName: 'Euler',
    frequency: 'daily',
    everyX: 1,
    notes: 'Daily sequential mathematical challenge from Project Euler.',
  },
  {
    key: 'rm-topics',
    text: '4 roadmap topics',
    type: 'daily',
    priority: 2, // hard
    tagName: 'Roadmap',
    frequency: 'daily',
    everyX: 1,
    notes: 'Complete 4 topics across your in-progress roadmaps.',
  },
];

/**
 * Provisions missing tags and the 7 required dailies in Habitica.
 */
export async function ensureDefaultDailies() {
  if (!isHabiticaConfigured()) return { ok: false, error: 'Not configured' };

  try {
    const existingTasks = (await getTasks('dailys')) || [];

    // Ensure tags
    const tagMap = {};
    for (const d of REQUIRED_DAILIES) {
      if (!tagMap[d.tagName]) {
        try {
          tagMap[d.tagName] = await ensureTag(d.tagName);
        } catch (err) {
          console.warn(`[habitica] Tag "${d.tagName}" check failed:`, err.message);
        }
      }
    }

    const created = [];
    const matched = [];

    for (const req of REQUIRED_DAILIES) {
      const existing = existingTasks.find(
        (t) =>
          t.text.toLowerCase().trim() === req.text.toLowerCase().trim() ||
          t.notes?.includes(`roadmapKey:${req.key}`),
      );

      if (existing) {
        matched.push({ key: req.key, id: existing.id, text: existing.text });
      } else {
        const tagId = tagMap[req.tagName];
        const newDaily = await createTask({
          text: req.text,
          type: 'daily',
          notes: `${req.notes}\n[roadmapKey:${req.key}]`,
          priority: req.priority,
          tags: tagId ? [tagId] : [],
          frequency: req.frequency,
          everyX: req.everyX,
        });
        created.push({ key: req.key, id: newDaily?.id, text: req.text });
      }
    }

    return { ok: true, created, matched };
  } catch (err) {
    console.error('[habitica] ensureDefaultDailies failed:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Synchronize a completion action from Roadmap app to Habitica.
 * taskKey can be 'lc-potd', 'lc-random', 'lc-quest', 'lc-studyplan', 'nc-daily', 'euler-daily', 'rm-topics'.
 */
export async function syncRoadmapTaskToHabitica(taskKey, isDone) {
  if (!isHabiticaConfigured()) return false;

  try {
    const dailys = (await getTasks('dailys')) || [];
    const spec = REQUIRED_DAILIES.find((d) => d.key === taskKey);
    const targetText = spec?.text.toLowerCase().trim();

    const target = dailys.find((t) => {
      const text = t.text.toLowerCase().trim();
      return (
        (targetText && text === targetText) ||
        t.notes?.includes(`roadmapKey:${taskKey}`) ||
        (taskKey === 'rm-topics' && text.includes('4 roadmap topics')) ||
        (taskKey === 'lc-potd' && text.includes('problem of the day')) ||
        (taskKey === 'euler-daily' && text.includes('project euler')) ||
        (taskKey === 'nc-daily' && text.includes('neetcode'))
      );
    });

    if (!target) {
      console.warn(`[habitica] Could not find Habitica daily matching "${taskKey}"`);
      return false;
    }

    const currentlyCompleted = Boolean(target.completed);
    if (isDone && !currentlyCompleted) {
      await scoreTask(target.id, 'up');
      console.log(`[habitica] Scored UP daily "${target.text}"`);
      return true;
    } else if (!isDone && currentlyCompleted) {
      await scoreTask(target.id, 'down');
      console.log(`[habitica] Scored DOWN daily "${target.text}"`);
      return true;
    }

    return true;
  } catch (err) {
    console.warn(`[habitica] Failed to sync "${taskKey}" to Habitica:`, err.message);
    return false;
  }
}

/**
 * Pull latest daily states from Habitica and update local roadmap state if needed.
 * Returns an array of synced task changes.
 */
export async function syncHabiticaToRoadmap(recordAttemptFn, clearTodayFn, getCompletionFn) {
  if (!isHabiticaConfigured()) return { ok: false, message: 'Habitica not configured' };

  try {
    const dailys = (await getTasks('dailys')) || [];
    const changes = [];

    for (const req of REQUIRED_DAILIES) {
      const target = dailys.find((t) => {
        const text = t.text.toLowerCase().trim();
        return (
          text === req.text.toLowerCase().trim() ||
          t.notes?.includes(`roadmapKey:${req.key}`)
        );
      });

      if (!target) continue;
      const isCompletedOnHabitica = Boolean(target.completed);
      const localCompletion = getCompletionFn ? getCompletionFn(req.key) : null;
      const isCompletedLocally = localCompletion?.status === 'done';

      if (isCompletedOnHabitica && !isCompletedLocally) {
        if (recordAttemptFn) {
          recordAttemptFn(req.key, { outcome: 'done' }, { skipRemoteSync: true });
          changes.push({ key: req.key, status: 'done', from: 'habitica' });
          console.log(`[habitica 2-way] Synced "${req.key}" as completed from Habitica`);
        }
      } else if (!isCompletedOnHabitica && isCompletedLocally) {
        if (clearTodayFn) {
          clearTodayFn(req.key, { skipRemoteSync: true });
          changes.push({ key: req.key, status: 'cleared', from: 'habitica' });
          console.log(`[habitica 2-way] Synced "${req.key}" as unchecked from Habitica`);
        }
      }
    }

    return { ok: true, changes };
  } catch (err) {
    console.warn('[habitica 2-way] Error polling Habitica:', err.message);
    return { ok: false, error: err.message };
  }
}
