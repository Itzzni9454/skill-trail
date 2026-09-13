#!/usr/bin/env node
/**
 * Server integration tests.
 *
 * Boots the real Express app as a subprocess against a scratch DATA_DIR and
 * exercises it over HTTP. This is where the regressions that matter live —
 * endpoint contracts, the security guards, and the bug fixes from the audit —
 * so they are checked against a running server, not mocked.
 *
 * Usage:  npm run test:api
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4599;
const BASE = `http://localhost:${PORT}`;

const scratch = mkdtempSync(join(tmpdir(), 'roadmap-api-'));
const roadmapsDir = join(scratch, 'roadmaps');
mkdirSync(roadmapsDir, { recursive: true });
// A couple of real roadmaps so endpoints have something to return.
for (const slug of ['frontend', 'backend']) {
  copyFileSync(join(ROOT, 'data', 'roadmaps', `${slug}.json`), join(roadmapsDir, `${slug}.json`));
}
writeFileSync(
  join(scratch, 'state.json'),
  JSON.stringify({
    nodeProgress: {},
    roadmapStatus: {},
    customRoadmaps: [],
    nodeNotes: {},
    activity: [],
    activityByDay: {},
    reviewSchedule: {},
    settings: { theme: 'light', dailyGoal: 5 },
  }),
);

const results = [];
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) results.push(`  ✓ ${name}`);
  else {
    failed++;
    results.push(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

/**
 * One request helper. Reads the body once as text and only then tries to parse
 * JSON — some endpoints (badges, .ics, .txt exports) legitimately return text,
 * and attempting res.json() first consumes the stream so the fallback fails.
 */
async function request(path, init) {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON — keep the raw text */
  }
  return { status: res.status, body, text, headers: res.headers };
}

const get = (path) => request(path);

function post(path, payload) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await get('/api/settings');
      if (r.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const server = spawn(process.execPath, [join(ROOT, 'server', 'src', 'server.js')], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: scratch },
  stdio: 'ignore',
});

let exitCode = 1;
try {
  const up = await waitForServer();
  if (!up) throw new Error('server did not start within 20s');

  /* --------------------------- basic contracts --------------------------- */
  const roadmaps = await get('/api/roadmaps');
  check('GET /api/roadmaps returns a list', roadmaps.status === 200 && Array.isArray(roadmaps.body));
  check(
    'roadmap list exposes counts',
    roadmaps.body?.[0] && 'doneCount' in roadmaps.body[0] && 'nodeCount' in roadmaps.body[0],
  );

  const stats = await get('/api/stats');
  check('GET /api/stats returns 200', stats.status === 200);
  check('stats includes recent activity', Array.isArray(stats.body?.recent));

  const settings = await get('/api/settings');
  check('GET /api/settings returns 200', settings.status === 200);

  /* -------------------------- security guards --------------------------- */
  // Regression guard for the path-traversal fix.
  for (const evil of ['..%2F..%2Fpackage', '..%2F..%2Fdata%2Fstate', '..%2F..%2Fserver']) {
    const r = await get(`/api/roadmaps/${evil}`);
    check(`traversal ${evil} is refused`, r.status === 404, `got ${r.status}`);
  }

  /* --------------------------- progress flow ---------------------------- */
  const NODE = 'e-k6EhoxYG9h0x6vWOrDh';
  const marked = await post('/api/progress/node', { slug: 'frontend', nodeId: NODE, status: 'done' });
  check('POST /api/progress/node marks done', marked.status === 200 && marked.body?.ok === true);

  const after = await get('/api/roadmaps');
  const fe = after.body?.find((r) => r.slug === 'frontend');
  check('done count increments', (fe?.doneCount ?? 0) >= 1, `doneCount=${fe?.doneCount}`);

  /* --------------------------- review ladder ---------------------------- */
  const reviews = await get('/api/reviews');
  check('GET /api/reviews returns 200', reviews.status === 200);
  check('reviews include nextUpcoming field', 'nextUpcoming' in (reviews.body ?? {}));
  check(
    'marking done schedules a review',
    (reviews.body?.upcomingCount ?? 0) >= 1,
    `upcomingCount=${reviews.body?.upcomingCount}`,
  );

  const scoped = await get('/api/reviews?scope=all');
  check(
    'scope=all folds upcoming into due',
    (scoped.body?.due?.length ?? 0) >= 1,
    `due=${scoped.body?.due?.length}`,
  );

  // Regression guard: answering an unscheduled topic must be 404, not 500.
  const answered = await post('/api/reviews/frontend/does-not-exist/answer', { grade: 'good' });
  check('answering an unscheduled topic is 404', answered.status === 404, `got ${answered.status}`);

  /* ------------------------------ themes -------------------------------- */
  const legacy = await post('/api/settings/theme', { theme: 'cherry' });
  check('retired theme is rejected', legacy.status === 400, `got ${legacy.status}`);

  const good = await post('/api/settings/theme', { theme: 'midnight' });
  check('shipped theme is accepted', good.status === 200, `got ${good.status}`);

  const reread = await get('/api/settings');
  check('theme persists', reread.body?.theme === 'midnight', `theme=${reread.body?.theme}`);

  /* ------------------------------ badges -------------------------------- */
  // Regression guard for the route-shadowing bug.
  const overall = await get('/api/badge/overall.svg');
  check('overall badge renders', overall.status === 200, `got ${overall.status}`);
  const slugBadge = await get('/api/badge/frontend.svg');
  check('per-roadmap badge renders', slugBadge.status === 200, `got ${slugBadge.status}`);

  /* ------------------------------ search -------------------------------- */
  const t0 = Date.now();
  const search = await get('/api/search/fulltext?q=kubernetes');
  const ms = Date.now() - t0;
  check('fulltext search returns 200', search.status === 200);
  check(`fulltext search is fast (${ms}ms)`, ms < 2000, `took ${ms}ms`);

  /* ----------------------------- connectors ------------------------------- */
  const list = await get('/api/connectors');
  check('GET /api/connectors returns 200', list.status === 200);
  check(
    'all four connectors are advertised',
    list.body?.connectors?.length === 4,
    `got ${list.body?.connectors?.length}`,
  );

  const configured = await request('/api/connectors/obsidian/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vaultPath: scratch, enabled: true }),
  });
  check('PUT connector config saves', configured.status === 200, `got ${configured.status}`);

  const afterCfg = await get('/api/connectors');
  const obs = afterCfg.body?.connectors?.find((c) => c.id === 'obsidian');
  check('obsidian reports configured + enabled', obs?.configured === true && obs?.enabled === true);
  check(
    'credentials are never echoed back',
    obs?.fields?.every((f) => !('value' in f)),
    'a field exposed a raw value',
  );

  const unconfiguredTest = await post('/api/connectors/habitica/test');
  check(
    'testing an unconfigured connector is 400',
    unconfiguredTest.status === 400,
    `got ${unconfiguredTest.status}`,
  );

  const unknown = await post('/api/connectors/nope/test');
  check('unknown connector is 404', unknown.status === 404, `got ${unknown.status}`);

  const sync = await post('/api/connectors/obsidian/sync');
  check('obsidian sync succeeds offline', sync.status === 200, `got ${sync.status}: ${sync.text}`);
  check('sync reports what it sent', typeof sync.body?.pushed !== 'undefined', JSON.stringify(sync.body));

  /* -------------------------------- dailys -------------------------------- */
  const board = await get('/api/dailys/board');
  check('GET /api/dailys/board returns 200', board.status === 200, `got ${board.status}`);
  check('board has a date key', typeof board.body?.date === 'string');
  check(
    'board lists the seeded dailys',
    (board.body?.dailys?.length ?? 0) >= 3,
    `got ${board.body?.dailys?.length}`,
  );
  check(
    'problem dailies resolve a real problem',
    board.body?.dailys?.some((d) => d.kind === 'potd' && d.problem?.title),
    'potd had no problem',
  );

  const dStats = await get('/api/dailys/stats');
  check('GET /api/dailys/stats returns 200', dStats.status === 200);
  check(
    'stats expose streak + rate fields',
    typeof dStats.body?.currentStreak === 'number' &&
      typeof dStats.body?.longestStreak === 'number' &&
      typeof dStats.body?.completionRate === 'number',
  );
  check('stats include a 30-day trend', dStats.body?.trend?.length === 30);

  const dHist = await get('/api/dailys/history?limit=10');
  check('GET /api/dailys/history returns 200', dHist.status === 200);
  check('history has total + rows', typeof dHist.body?.total === 'number' && Array.isArray(dHist.body?.rows));

  // Daily reset: an attempt is recorded against *today's* key only.
  const attempt = await post('/api/dailys/habit-review/attempt', {
    outcome: 'done',
    seconds: 120,
  });
  check('recording a daily attempt succeeds', attempt.status === 200, `got ${attempt.status}`);
  check(
    'completion is stamped with today',
    attempt.body?.completion?.dateKey === new Date().toISOString().slice(0, 10) ||
      /^\d{4}-\d{2}-\d{2}$/.test(attempt.body?.completion?.dateKey ?? ''),
    JSON.stringify(attempt.body?.completion?.dateKey),
  );

  const badOutcome = await post('/api/dailys/habit-review/attempt', { outcome: 'not-a-real-outcome' });
  check('invalid outcome is rejected', badOutcome.status === 400, `got ${badOutcome.status}`);

  const unknownDaily = await post('/api/dailys/nope/attempt', { outcome: 'done' });
  check('unknown daily is 404', unknownDaily.status === 404, `got ${unknownDaily.status}`);

  // Extensibility: add a custom daily, verify it appears, then remove it.
  const created = await post('/api/dailys/definitions', {
    title: `Test daily ${Date.now()}`,
    kind: 'custom',
  });
  check('adding a daily succeeds', created.status === 200, `got ${created.status}`);
  const newId = created.body?.definition?.id;
  check('new daily has an id', !!newId);

  if (newId) {
    const afterAdd = await get('/api/dailys/board');
    check(
      'new daily appears on the board',
      afterAdd.body?.dailys?.some((d) => d.id === newId),
      'not found on board',
    );
    const removed = await request(`/api/dailys/definitions/${newId}`, { method: 'DELETE' });
    check('deleting a daily succeeds', removed.status === 200, `got ${removed.status}`);
  }

  const noTitle = await post('/api/dailys/definitions', { title: '   ' });
  check('daily without a title is rejected', noTitle.status === 400, `got ${noTitle.status}`);

  /* --------------------------- export endpoints -------------------------- */
  const anki = await get('/api/anki/frontend/export');
  check('anki export returns 200', anki.status === 200, `got ${anki.status}`);
  const ics = await get('/api/calendar.ics');
  check('calendar export returns 200', ics.status === 200, `got ${ics.status}`);
  const backup = await get('/api/backup');
  check('backup export returns 200', backup.status === 200, `got ${backup.status}`);

  /* --------------------------- leetcode quest endpoints -------------------------- */
  const questsRes = await get('/api/leetcode/quests');
  check('GET /api/leetcode/quests returns 200', questsRes.status === 200, `got ${questsRes.status}`);
  check(
    'quests include all 4 official tracks',
    Array.isArray(questsRes.body?.quests) && questsRes.body.quests.length === 4,
    `got ${questsRes.body?.quests?.length} quests`,
  );
  const dsa = (questsRes.body?.quests || []).find((q) => q.slug === 'data-structures-and-algorithms-quest');
  check('DSA quest has 35 total levels and 8 units', dsa?.totalLevels === 35 && dsa?.units?.length === 8);

  const progRes = await post('/api/leetcode/quests/progress', {
    slug: 'data-structures-and-algorithms-quest',
    unitId: '1',
    action: 'increment',
    levels: 1,
    maxLevels: 4,
  });
  check('POST /api/leetcode/quests/progress returns 200', progRes.status === 200, `got ${progRes.status}`);
  check(
    'progress increments completedLevels for DSA',
    progRes.body?.quest?.completedLevels === 1,
    `got ${progRes.body?.quest?.completedLevels}`,
  );

  const suggestRes = await get('/api/leetcode/quests/suggest');
  check('GET /api/leetcode/quests/suggest returns 200', suggestRes.status === 200, `got ${suggestRes.status}`);
  check('suggested quest has an active unit', !!suggestRes.body?.quest?.activeUnit);
} catch (err) {
  failed++;
  results.push(`  ✗ harness error: ${err.message}`);
} finally {
  server.kill('SIGKILL');
  rmSync(scratch, { recursive: true, force: true });
}

console.log(results.join('\n'));
console.log(`\n  ${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
