/**
 * Third-party connectors: Obsidian, Habitica, Notion, Microsoft To Do.
 *
 * Design constraints, in order:
 *
 * 1. **Offline stays the default.** Every network call is wrapped, time-boxed
 *    and failure-tolerant. A dead connector never blocks learning — items are
 *    queued and flushed later.
 * 2. **Credentials are separate.** They live in `data/connectors.json`, not
 *    `state.json`, so your learning data stays portable and you can delete
 *    tokens without touching progress.
 * 3. **One interface.** Each connector exposes `fields`, `isConfigured`,
 *    `testConnection` and `push`. Adding a fifth means writing one more object.
 */
import fs from 'node:fs';
import path from 'node:path';
// Use the SAME data dir as store.js — deriving it from cwd put these files in
// server/data while everything else lived in the repo-root data/.
import { DATA_DIR } from './store.js';

const CONFIG_FILE = path.join(DATA_DIR, 'connectors.json');

const TIMEOUT_MS = 8000;

/* ------------------------------- storage -------------------------------- */

const EMPTY = { connectors: {}, queue: {} };

export function loadConnectors() {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveConnectors(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

/* ------------------------------- helpers -------------------------------- */

/** fetch with a hard timeout so a hanging host can't stall the server. */
async function timedFetch(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, body, headers, method = 'POST') {
  const res = await timedFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON response is fine, we only care about the status */
  }
  if (!res.ok) {
    const detail = typeof parsed === 'object' ? (parsed.message ?? JSON.stringify(parsed)) : text;
    throw new Error(`HTTP ${res.status}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`);
  }
  return parsed;
}

/** Markdown body shared by the file/markdown-shaped targets. */
function topicMarkdown(item) {
  return [
    '---',
    `roadmap: ${item.slug}`,
    `node: ${item.nodeId}`,
    `status: ${item.status}`,
    `completed: ${item.at}`,
    '---',
    '',
    `# ${item.label}`,
    '',
    `Completed ${item.at} · roadmap **${item.slug}**`,
    '',
  ].join('\n');
}

function safeFileName(name) {
  return (
    String(name)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'topic'
  );
}

/* ------------------------------ connectors ------------------------------- */

export const CONNECTORS = {
  /** Habitica — gamified task tracker with a simple REST API. */
  habitica: {
    id: 'habitica',
    name: 'Habitica',
    kind: 'api',
    description: 'Create a To-Do in Habitica for each completed topic.',
    docs: 'Find your User ID and API Token under Settings → API. Sent as X-Api-User / X-Api-Key.',
    fields: [
      { key: 'userId', label: 'User ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'apiToken', label: 'API Token', type: 'password', placeholder: '••••••••' },
    ],
    isConfigured: (c) => !!c?.userId && !!c?.apiToken,
    headers: (cfg) => ({
      'x-api-user': cfg.userId,
      'x-api-key': cfg.apiToken,
      'x-client': 'skill-trail',
    }),
    async testConnection(cfg) {
      const res = await timedFetch('https://habitica.com/api/v3/user', { headers: this.headers(cfg) });
      if (!res.ok) throw new Error(`HTTP ${res.status} — check your User ID and API Token`);
      const json = await res.json();
      return { ok: true, detail: `Signed in as ${json?.data?.profile?.name ?? 'your Habitica account'}` };
    },
    async push(items, cfg) {
      let pushed = 0;
      for (const item of items) {
        await postJson(
          'https://habitica.com/api/v3/tasks/user',
          { text: `${item.label} (${item.slug})`, type: 'todo', notes: `Roadmap: ${item.slug}`, priority: 1 },
          this.headers(cfg),
        );
        pushed++;
      }
      return { pushed, detail: `${pushed} Habitica to-do(s) created` };
    },
  },

  /**
   * Microsoft To Do via Graph. Graph needs an OAuth token; rather than ship a
   * full OAuth dance (which would need a public redirect URL and app
   * registration), you paste a delegated access token obtained from Graph
   * Explorer or your own app registration.
   */
  mstodo: {
    id: 'mstodo',
    name: 'Microsoft To Do',
    kind: 'api',
    description: 'Create a task in a Microsoft To Do list.',
    docs: 'Paste a delegated access token from Graph Explorer (developer.microsoft.com/graph/graph-explorer) with Tasks.ReadWrite scope. Leave List ID blank to use the default list.',
    fields: [
      { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'eyJ0eXAi…' },
      { key: 'listId', label: 'List ID (optional)', type: 'text', placeholder: 'defaults to your default list' },
    ],
    isConfigured: (c) => !!c?.accessToken,
    headers: (cfg) => ({ Authorization: `Bearer ${cfg.accessToken}` }),
    async listUrl(cfg) {
      if (cfg?.listId) return `https://graph.microsoft.com/v1.0/me/todo/lists/${cfg.listId}/tasks`;
      // Resolve the default list once.
      const res = await timedFetch('https://graph.microsoft.com/v1.0/me/todo/lists?$filter=wellknownListName eq \'defaultList\'', {
        headers: this.headers(cfg),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — token may be expired or missing Tasks.ReadWrite`);
      const json = await res.json();
      const id = json?.value?.[0]?.id;
      if (!id) throw new Error('Could not find a default To Do list');
      return `https://graph.microsoft.com/v1.0/me/todo/lists/${id}/tasks`;
    },
    async testConnection(cfg) {
      const res = await timedFetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
        headers: this.headers(cfg),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — token may be expired`);
      return { ok: true, detail: 'Graph token accepted' };
    },
    async push(items, cfg) {
      const url = await this.listUrl(cfg);
      let pushed = 0;
      for (const item of items) {
        await postJson(
          url,
          { title: `${item.label} (${item.slug})`, body: { content: `Roadmap: ${item.slug}`, contentType: 'text' } },
          this.headers(cfg),
        );
        pushed++;
      }
      return { pushed, detail: `${pushed} To Do task(s) created` };
    },
  },

  /** Obsidian — markdown notes written straight into a vault folder. */
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian',
    kind: 'filesystem',
    description: 'Write a markdown note per completed topic into your vault.',
    docs: 'Point vaultPath at your Obsidian vault folder (any folder works — created if missing inside the vault root).',
    fields: [
      { key: 'vaultPath', label: 'Vault folder', type: 'text', placeholder: 'C:\\Users\\you\\Documents\\MyVault' },
    ],
    isConfigured: (c) => !!c?.vaultPath,
    async testConnection(cfg) {
      const vault = cfg.vaultPath;
      if (!fs.existsSync(vault)) {
        throw new Error(`Vault folder "${vault}" does not exist`);
      }
      const probe = path.join(vault, '.skill-trail-probe');
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
      return { ok: true, detail: `Vault writable: ${vault}` };
    },
    async push(items, cfg) {
      let pushed = 0;
      for (const item of items) {
        const dir = path.join(cfg.vaultPath, safeFileName(item.slug));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${safeFileName(item.label)}.md`), topicMarkdown(item));
        pushed++;
      }
      return { pushed, detail: `${pushed} note(s) written to the vault` };
    },
  },

  /** Notion — one row per completed topic in a database you share with it. */
  notion: {
    id: 'notion',
    name: 'Notion',
    kind: 'api',
    description: 'Add a row to a Notion database for each completed topic.',
    docs: 'Create an integration (notion.so/my-integrations), share the database with it, then paste the integration token and the database ID (from the database URL, before ?v=).',
    fields: [
      { key: 'token', label: 'Integration token', type: 'password', placeholder: 'secret_…' },
      { key: 'databaseId', label: 'Database ID', type: 'text', placeholder: '32 hex chars from the database URL' },
    ],
    isConfigured: (c) => !!c?.token && !!c?.databaseId,
    headers: (cfg) => ({
      Authorization: `Bearer ${cfg.token}`,
      'Notion-Version': '2022-06-28',
    }),
    async testConnection(cfg) {
      const res = await timedFetch(`https://api.notion.com/v1/databases/${cfg.databaseId}`, {
        headers: this.headers(cfg),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — check the token and that the database is shared with the integration`);
      const json = await res.json();
      return { ok: true, detail: `Database: ${json?.title?.[0]?.plain_text ?? cfg.databaseId}` };
    },
    async push(items, cfg) {
      let pushed = 0;
      for (const item of items) {
        await postJson(`https://api.notion.com/v1/pages`, {
          parent: { database_id: cfg.databaseId },
          properties: {
            Name: { title: [{ text: { content: item.label } }] },
            Roadmap: { rich_text: [{ text: { content: item.slug } }] },
          },
        }, this.headers(cfg));
        pushed++;
      }
      return { pushed, detail: `${pushed} Notion row(s) created` };
    },
  },
};

/* -------------------------------- queue ---------------------------------- */

/** Record a completed topic against every enabled connector, then try to send. */
export function recordCompletion(item) {
  const data = loadConnectors();
  const outcomes = {};
  for (const [id, cfgRaw] of Object.entries(data.connectors || {})) {
    const cfg = cfgRaw || {};
    if (!cfg.enabled) continue;
    const def = CONNECTORS[id];
    if (!def || !def.isConfigured?.(cfg)) continue;
    if (cfg.syncOn !== false) {
      data.queue[id] = data.queue[id] || [];
      data.queue[id].push(item);
    }
  }
  saveConnectors(data);
  // Best-effort send; failures stay queued for the next flush.
  return flushAll().then((r) => {
    for (const [id, res] of Object.entries(r)) outcomes[id] = res;
    return outcomes;
  });
}

/** Push one connector's queue. Keeps items that still fail. */
export async function flush(id) {
  const data = loadConnectors();
  const def = CONNECTORS[id];
  const cfg = data.connectors?.[id];
  const queued = data.queue?.[id] || [];
  if (!def || !cfg?.enabled || !def.isConfigured?.(cfg)) {
    return { ok: false, skipped: true, remaining: queued.length };
  }
  if (!queued.length) return { ok: true, pushed: 0, remaining: 0, detail: 'nothing queued' };

  try {
    const res = await def.push(queued, cfg);
    data.queue[id] = [];
    saveConnectors(data);
    return { ok: true, pushed: res.pushed ?? queued.length, detail: res.detail, remaining: 0 };
  } catch (err) {
    // Leave the queue intact — the item will retry on the next flush or sync.
    data.queue[id] = queued;
    saveConnectors(data);
    return { ok: false, error: String(err?.message ?? err), remaining: queued.length };
  }
}

export async function flushAll() {
  const data = loadConnectors();
  const out = {};
  for (const id of Object.keys(data.connectors || {})) {
    if (data.connectors[id]?.enabled) out[id] = await flush(id);
  }
  return out;
}

/** Public summary for the UI — never leaks credentials. */
export function describeAll() {
  const data = loadConnectors();
  return Object.values(CONNECTORS).map((c) => {
    const cfg = data.connectors?.[c.id] || {};
    const queued = (data.queue?.[c.id] || []).length;
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      description: c.description,
      docs: c.docs,
      fields: c.fields.map((f) => ({ ...f, configured: !!cfg[f.key] })),
      enabled: !!cfg.enabled,
      configured: !!c.isConfigured?.(cfg),
      queued,
      lastError: cfg.lastError || null,
      lastSyncAt: cfg.lastSyncAt || null,
    };
  });
}
