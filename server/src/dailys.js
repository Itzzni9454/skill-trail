/**
 * Dailys — recurring daily tasks.
 *
 * Data model
 * ----------
 *   definition   { id, kind, title, description, enabled, order, quest? }
 *                 kind: 'potd' | 'random' | 'quest' | 'custom'
 *   completion   keyed `${dateKey}|${taskId}` — one record per task per day
 *   attempt      append-only history entry
 *
 * Daily reset
 * -----------
 * Completions are keyed by *local* date, so there is nothing to clear at
 * midnight — a new day simply has no record yet. That removes a whole class of
 * "did the cron run?" bugs. `isDoneToday` is a lookup, not a computation.
 *
 * Everything is stored in data/dailys.json, separate from learning progress.
 */
import fs from 'node:fs';
import path from 'node:path';
// Use the SAME data dir as store.js — deriving it from cwd put these files in
// server/data while everything else lived in the repo-root data/.
import { DATA_DIR } from './store.js';
import { resolveProblem } from './leetcode.js';
import { getRandomNeetcodeProblem } from './neetcode.js';
import { getDailyEulerProblem } from './euler.js';
import { syncRoadmapTaskToHabitica } from './habitica.js';
import { updateCalendarEventStatus } from './gcalendar.js';

const FILE = path.join(DATA_DIR, 'dailys.json');

/** Monday-first is irrelevant here; this is just a stable local-day key. */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* --------------------------- seeded definitions --------------------------- */
// The three LeetCode dailies plus a few generic habits, to show the model is not
// LeetCode-specific. `kind: 'custom'` tasks need no network at all.

const SEED = [
  {
    id: 'lc-potd',
    kind: 'potd',
    title: 'Problem of the Day',
    description: "LeetCode's daily challenge.",
    enabled: true,
    order: 1,
  },
  {
    id: 'lc-random',
    kind: 'random',
    title: 'Random Problem',
    description: 'A random free problem from the full set.',
    enabled: true,
    order: 2,
  },
  {
    id: 'lc-quest',
    kind: 'quest',
    title: 'Quest',
    description: 'A themed problem — pick a difficulty to target.',
    enabled: true,
    order: 3,
    quest: { difficulty: 'Medium' },
  },
  {
    id: 'lc-studyplan',
    kind: 'studyplan',
    title: 'Study Plan',
    description: 'A sequential problem from a random LeetCode Study Plan based on your progress.',
    enabled: true,
    order: 4,
  },
  {
    id: 'nc-daily',
    kind: 'neetcode',
    title: 'NeetCode Daily',
    description: 'A random problem from NeetCode All (Free).',
    enabled: true,
    order: 5,
  },
  {
    id: 'euler-daily',
    kind: 'euler',
    title: 'Project Euler Daily',
    description: 'Solve mathematical challenges sequentially from Project Euler (#1 today, #2 tomorrow, ...).',
    enabled: true,
    order: 6,
  },
  {
    id: 'rm-topics',
    kind: 'roadmap',
    title: '4 Roadmap Topics',
    description: 'Complete 4 topics across your roadmaps in progress.',
    enabled: true,
    order: 7,
    targetCount: 4,
  },
  {
    id: 'habit-review',
    kind: 'custom',
    title: 'Review flashcards',
    description: 'Clear your spaced-repetition queue.',
    enabled: true,
    order: 8,
  },
  {
    id: 'habit-read',
    kind: 'custom',
    title: 'Read 10 pages',
    description: 'Keep the reading habit alive.',
    enabled: false,
    order: 9,
  },
];

/* ------------------------------- storage ---------------------------------- */

const EMPTY = { definitions: [], completions: {}, attempts: [], assignments: {} };

export function loadDailys() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const defs = Array.isArray(parsed.definitions) ? parsed.definitions : [];
    // Seed once, and keep any LeetCode defaults that were deleted re-addable.
    if (!defs.length) {
      return { ...EMPTY, ...parsed, definitions: SEED.map((d) => ({ ...d })) };
    }
    // Ensure core leetcode definitions (potd, random, quest, studyplan) exist
    for (const seedItem of SEED) {
      if (!defs.some((d) => d.id === seedItem.id)) {
        defs.push({ ...seedItem });
      }
    }
    return { ...EMPTY, ...parsed, definitions: defs };
  } catch {
    return { ...EMPTY, definitions: SEED.map((d) => ({ ...d })) };
  }
}

export function saveDailys(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/* ----------------------------- definitions -------------------------------- */

export function listDefinitions() {
  return loadDailys().definitions.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export function addDefinition(def) {
  const data = loadDailys();
  const id =
    def.id ||
    `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (data.definitions.some((d) => d.id === id)) throw new Error('A task with that id exists');
  const next = {
    id,
    kind: def.kind || 'custom',
    title: String(def.title || '').trim() || 'Untitled daily',
    description: String(def.description || '').trim(),
    enabled: def.enabled !== false,
    order: def.order ?? (data.definitions.length + 1),
    quest: def.quest || undefined,
  };
  data.definitions.push(next);
  saveDailys(data);
  return next;
}

export function updateDefinition(id, patch) {
  const data = loadDailys();
  const i = data.definitions.findIndex((d) => d.id === id);
  if (i < 0) return null;
  const merged = {
    ...data.definitions[i],
    ...patch,
    id, // never allow renaming the id through a patch
  };
  data.definitions[i] = merged;
  saveDailys(data);
  return merged;
}

export function removeDefinition(id) {
  const data = loadDailys();
  const before = data.definitions.length;
  data.definitions = data.definitions.filter((d) => d.id !== id);
  // Drop associated records so history doesn't reference a deleted task.
  for (const k of Object.keys(data.completions)) {
    if (k.endsWith(`|${id}`)) delete data.completions[k];
  }
  data.attempts = data.attempts.filter((a) => a.taskId !== id);
  saveDailys(data);
  return data.definitions.length < before;
}

/* ------------------------------ completions -------------------------------- */

const completionKey = (taskId, d = new Date()) => `${dateKey(d)}|${taskId}`;

export function getCompletion(taskId, d = new Date()) {
  return loadDailys().completions[completionKey(taskId, d)] || null;
}

/**
 * Record an attempt and, when the outcome is a success, mark today complete.
 * `seconds` is supplied by the client (solve timer); the server clamps it sane.
 */
export function recordAttempt(
  taskId,
  { outcome = 'attempted', seconds = null, problem = null } = {},
  options = {},
) {
  const data = loadDailys();
  const def = data.definitions.find((d) => d.id === taskId);
  if (!def) return null;

  const now = new Date();
  const key = completionKey(taskId, now);
  const existing = data.completions[key];
  const solved = outcome === 'accepted' || outcome === 'done';
  const secs =
    seconds == null ? null : Math.max(0, Math.min(86400, Math.round(Number(seconds) || 0)));

  const fallbackDiff = def.quest?.difficulty || 'Medium';
  const entry = {
    taskId,
    at: now.toISOString(),
    dateKey: dateKey(now),
    outcome,
    seconds: secs,
    problem: problem ? trimProblem(problem, fallbackDiff) : null,
  };
  data.attempts.push(entry);

  data.completions[key] = {
    taskId,
    dateKey: entry.dateKey,
    status: solved ? 'done' : existing?.status === 'done' ? 'done' : 'attempted',
    startedAt: existing?.startedAt ?? now.toISOString(),
    completedAt: solved ? now.toISOString() : existing?.completedAt ?? null,
    solveSeconds: secs ?? existing?.solveSeconds ?? null,
    outcome,
    problem: entry.problem || existing?.problem || null,
    attemptsToday: (existing?.attemptsToday ?? 0) + 1,
  };

  saveDailys(data);

  if (solved && !options.skipRemoteSync) {
    syncRoadmapTaskToHabitica(taskId, true).catch(() => {});
    updateCalendarEventStatus(taskId, true).catch(() => {});
  }

  return data.completions[key];
}

/** Undo today's completion (e.g. mis-click). Does not erase the attempt log. */
export function clearToday(taskId, options = {}) {
  const data = loadDailys();
  const key = completionKey(taskId);
  if (!data.completions[key]) return false;
  delete data.completions[key];
  saveDailys(data);

  if (!options.skipRemoteSync) {
    syncRoadmapTaskToHabitica(taskId, false).catch(() => {});
    updateCalendarEventStatus(taskId, false).catch(() => {});
  }

  return true;
}

function trimProblem(p, fallbackDiff = 'Medium') {
  if (!p || typeof p !== 'object') return null;
  const d = p.difficulty;
  const normalizedDiff = (d === 'Easy' || d === 'Hard') ? d : (d === 'Medium' ? 'Medium' : fallbackDiff);
  return {
    slug: p.slug ?? null,
    title: p.title ?? null,
    frontendId: p.frontendId ?? null,
    difficulty: normalizedDiff,
    acceptanceRate: p.acceptanceRate ?? null,
    topicTags: Array.isArray(p.topicTags) ? p.topicTags.slice(0, 12) : [],
    source: p.source ?? null,
  };
}

/* -------------------------------- board ----------------------------------- */

/**
 * Today's board: every enabled definition with its resolved problem (for
 * LeetCode kinds) and today's completion state. A failing fetch still yields a
 * usable card, so the board never blanks out.
 */
export async function getBoard() {
  const data = loadDailys();
  const defs = data.definitions.filter((d) => d.enabled);
  const completions = data.completions;
  const assignments = data.assignments || {};
  const today = dateKey();
  let modified = false;

  // Clear assignments from previous days
  for (const k of Object.keys(assignments)) {
    if (!k.startsWith(today + '|')) {
      delete assignments[k];
      modified = true;
    }
  }

  const cards = await Promise.all(
    defs.map(async (def) => {
      let problem = null;
      const key = completionKey(def.id);

      if (def.kind === 'potd' || def.kind === 'random' || def.kind === 'quest' || def.kind === 'studyplan' || def.kind === 'neetcode' || def.kind === 'euler') {
        if (assignments[key]) {
          problem = assignments[key];
        } else {
          if (def.kind === 'neetcode') {
            problem = getRandomNeetcodeProblem(def.quest || {});
          } else if (def.kind === 'euler') {
            problem = await getDailyEulerProblem();
          } else {
            problem = await resolveProblem(def.kind, def.quest || {}).catch(() => null);
          }
          if (problem) {
            assignments[key] = problem;
            modified = true;
          }
        }
        if (problem) {
          if (!problem.difficulty || (problem.difficulty !== 'Easy' && problem.difficulty !== 'Hard')) {
            problem.difficulty = def.quest?.difficulty || 'Medium';
          }
          if (!problem.video && (problem.title || problem.slug)) {
            problem.video = `https://www.youtube.com/results?search_query=${encodeURIComponent('LeetCode ' + (problem.frontendId ? problem.frontendId + ' ' : '') + (problem.title || problem.slug) + ' solution')}`;
          }
        }
      }
      const completion = completions[key] || null;
      return {
        ...def,
        problem,
        completion,
        doneToday: completion?.status === 'done',
      };
    }),
  );

  if (modified) {
    data.assignments = assignments;
    saveDailys(data);
  }

  return {
    date: today,
    dailys: cards,
    summary: {
      total: cards.length,
      done: cards.filter((c) => c.doneToday).length,
    },
  };
}

export async function rerollDaily(taskId) {
  // Step 1: Run getBoard() to resolve and persist ALL of today's assignments so
  // they are saved to disk before we overwrite just one of them below.
  await getBoard();

  // Step 2: Resolve a fresh problem for this specific task only.
  const data = loadDailys();
  const def = data.definitions.find((d) => d.id === taskId);
  if (!def) throw new Error('No such daily');
  if (!['potd', 'random', 'quest', 'studyplan', 'neetcode', 'euler'].includes(def.kind)) {
    throw new Error('Only problem-based dailies can be rerolled');
  }

  const prevAssignment = data.assignments?.[completionKey(def.id)];
  const options = { ...(def.quest || {}) };
  if (def.kind === 'studyplan' && prevAssignment?.planSlug) {
    options.excludePlanSlug = prevAssignment.planSlug;
  }
  if (def.kind === 'neetcode' && prevAssignment?.code) {
    options.excludeCode = prevAssignment.code;
  }
  if (def.kind === 'euler' && prevAssignment?.eulerId) {
    options.excludeId = prevAssignment.eulerId;
    options.reroll = true;
  }

  let problem;
  if (def.kind === 'neetcode') {
    problem = getRandomNeetcodeProblem(options);
  } else if (def.kind === 'euler') {
    problem = await getDailyEulerProblem(options);
  } else {
    problem = await resolveProblem(def.kind, options).catch(() => null);
  }

  // Step 3: Re-load from disk (getBoard may have written assignments) and patch
  // ONLY this task's assignment, leaving all others intact.
  if (problem) {
    const fresh = loadDailys();
    fresh.assignments = fresh.assignments || {};
    fresh.assignments[completionKey(def.id)] = problem;
    saveDailys(fresh);
  }
  return problem;
}

/* ------------------------------ aggregates --------------------------------- */

function daySetFromAttempts(attempts) {
  const days = new Set();
  for (const a of attempts) {
    if (a.outcome === 'accepted' || a.outcome === 'done') days.add(a.dateKey);
  }
  return days;
}

function streaks(days) {
  const sorted = [...days].sort();
  if (!sorted.length) return { current: 0, longest: 0 };

  const toTs = (k) => Date.parse(`${k}T00:00:00`);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round((toTs(sorted[i]) - toTs(sorted[i - 1])) / 86400_000);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // Current streak counts back from today; a streak isn't broken until a full
  // day is missed, so yesterday still counts as "today's" streak.
  let current = 0;
  const cursor = new Date();
  for (;;) {
    if (days.has(dateKey(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (current === 0 && !days.has(dateKey(new Date()))) {
      // Allow the streak to start from yesterday if today hasn't been touched.
      cursor.setDate(cursor.getDate() - 1);
      if (!days.has(dateKey(cursor))) break;
    } else break;
  }

  return { current, longest: Math.max(longest, current) };
}

export function getStats() {
  const data = loadDailys();
  const attempts = data.attempts || [];
  const days = daySetFromAttempts(attempts);
  const { current, longest } = streaks(days);

  const solved = attempts.filter((a) => a.outcome === 'accepted' || a.outcome === 'done');

  // Completion rate bucketed by difficulty. Strictly only Easy, Medium, Hard allowed.
  const byDifficulty = {};
  for (const a of attempts) {
    let d = a.problem?.difficulty;
    if (!d || d === 'Unknown') {
      const def = data.definitions.find((x) => x.id === a.taskId);
      d = def?.quest?.difficulty || 'Medium';
    }
    if (d !== 'Easy' && d !== 'Medium' && d !== 'Hard') {
      d = 'Medium';
    }
    byDifficulty[d] ||= { attempts: 0, solved: 0 };
    byDifficulty[d].attempts++;
    if (a.outcome === 'accepted' || a.outcome === 'done') byDifficulty[d].solved++;
  }
  for (const v of Object.values(byDifficulty)) {
    v.rate = v.attempts ? Math.round((v.solved / v.attempts) * 100) : 0;
  }

  const times = solved.map((a) => a.seconds).filter((s) => typeof s === 'number' && s > 0);
  const avgSolveSeconds = times.length
    ? Math.round(times.reduce((x, y) => x + y, 0) / times.length)
    : null;

  // Last 30 days of activity for a small sparkline.
  const perDay = {};
  for (const a of attempts) {
    perDay[a.dateKey] ||= { attempts: 0, solved: 0 };
    perDay[a.dateKey].attempts++;
    if (a.outcome === 'accepted' || a.outcome === 'done') perDay[a.dateKey].solved++;
  }
  const trend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dateKey(d);
    trend.push({ date: k, ...(perDay[k] || { attempts: 0, solved: 0 }) });
  }

  return {
    currentStreak: current,
    longestStreak: longest,
    totalAttempts: attempts.length,
    totalSolved: solved.length,
    completionRate: attempts.length ? Math.round((solved.length / attempts.length) * 100) : 0,
    byDifficulty,
    avgSolveSeconds,
    activeDays: days.size,
    trend,
  };
}

export function getHistory({ limit = 100, offset = 0, taskId = null, outcome = null } = {}) {
  const data = loadDailys();
  let rows = (data.attempts || []).slice().reverse();
  if (taskId) rows = rows.filter((r) => r.taskId === taskId);
  if (outcome) rows = rows.filter((r) => r.outcome === outcome);
  const total = rows.length;
  return { total, rows: rows.slice(offset, offset + limit) };
}
