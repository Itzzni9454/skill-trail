/**
 * Tiny JSON-file persistence layer for the offline roadmap app.
 * Atomic writes (tmp file + rename) keep data safe on crash.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..', '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const ROADMAPS_DIR = path.join(DATA_DIR, 'roadmaps');
export const CONTENT_DIR = path.join(ROOT, 'developer-roadmap', 'roadmaps');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');

/* ------------------------------ input guards ---------------------------- */

/**
 * Slugs arrive straight off the URL (`/api/roadmaps/:slug`) and get joined onto
 * filesystem paths, so they MUST be validated before use. Express decodes `%2F`
 * inside a route param, so an unvalidated slug lets `..%2F..%2Fdata%2Fstate`
 * escape DATA_DIR and read arbitrary JSON files.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
/** Node ids are base64url-ish (`e-k6EhoxYG9h0x6vWOrDh`) — never path-like. */
const NODE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isSafeSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

export function isSafeNodeId(nodeId) {
  return typeof nodeId === 'string' && NODE_ID_RE.test(nodeId);
}

/* ----------------------------- review queue ----------------------------- */

/** Review intervals (days) at each stage of the ladder. Stage 0 = "learned
 *  today, first review tomorrow". Last stage = fully consolidated. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 90];

/**
 * Review-schedule shape stored under state.reviewSchedule[`${slug}|${nodeId}`]:
 *   stage   — index into REVIEW_INTERVAL_DAYS the item just completed
 *   dueAt   — ISO timestamp of the next due date
 *   doneAt  — when the topic was marked done
 * All three fields are required for an entry to participate in scheduling.
 */
export const REVIEW_SCHEMA_VERSION = 1;

/** Validate + normalize a schedule entry; null when unusable (data lost, upgrade). */
export function normalizeReviewEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const stage = Number(e.stage);
  const dueAt = Date.parse(e.dueAt);
  const doneAt = Date.parse(e.doneAt);
  if (!Number.isInteger(stage) || stage < 0 || stage >= REVIEW_INTERVAL_DAYS.length) return null;
  if (!Number.isFinite(dueAt) || !Number.isFinite(doneAt)) return null;
  return { stage, dueAt: new Date(dueAt).toISOString(), doneAt: new Date(doneAt).toISOString() };
}

/** Local-timezone date key `YYYY-MM-DD` (server = user's machine). */
export function reviewDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Grade result for an answered review.
 *   good    — advance one ladder stage
 *   again   — repeat the current interval (failed recall)
 *   dismiss — user opted out; entry is removed
 */
export const REVIEW_GRADES = ['good', 'again', 'dismiss', 'hard', 'easy'];

/** Days until the next review for a given ladder stage. */
export function reviewIntervalFor(stage) {
  return REVIEW_INTERVAL_DAYS[Math.min(Math.max(stage, 0), REVIEW_INTERVAL_DAYS.length - 1)];
}

/**
 * Ensure data/ and data/roadmaps/ exist so a fresh install (or a wiped data
 * dir) doesn't 500 on the first request. recursive:true makes this a no-op
 * when they already exist.
 */
export function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ROADMAPS_DIR, { recursive: true });
}

// Run once at startup — fail fast here (e.g. read-only volume) rather than
// serving 500s from every route later.
ensureDataDirs();

/** @returns {Record<string, any>} app state (progress etc.) */
export function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { nodeProgress: {}, roadmapStatus: {}, customRoadmaps: [], questProgress: {} };
  }
}

/** Persist app state atomically. */
export function saveState(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

/** Update state atomically under a mutation function. */
export function mutateState(fn) {
  const state = loadState();
  fn(state);
  saveState(state);
  return state;
}

/** List all roadmap JSON files in data/roadmaps. @returns {{slug, file, mtime}[]} */
export function listRoadmapFiles() {
  ensureDataDirs(); // defensive: recreate if the folder was deleted while running
  return fs
    .readdirSync(ROADMAPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const file = path.join(ROADMAPS_DIR, f);
      return { slug: f.replace(/\.json$/, ''), file, mtime: fs.statSync(file).mtimeMs };
    });
}

/** Load one roadmap JSON by slug, or null. Unsafe slugs are rejected outright. */
export function loadRoadmap(slug) {
  if (!isSafeSlug(slug)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(ROADMAPS_DIR, slug + '.json'), 'utf8'));
  } catch {
    return null;
  }
}

/* ----------------------------- topic content ---------------------------- */

/**
 * Path index for topic content: `slug|nodeId` -> absolute .md path, built by
 * walking each `<slug>/content/` directory once (93 readdir calls for the
 * current corpus).
 *
 * The previous implementation ran readdirSync on *every* lookup, so
 * /api/search/fulltext ended up doing one directory scan per node across every
 * roadmap — 10.1s for a single query, blocking the event loop the whole time.
 */
let contentPathIndex = null;
/** Lazily-read file bodies keyed by path (~7.7 MB for the full corpus). */
let contentTextCache = null;

function buildContentPathIndex() {
  const index = new Map();
  let entries;
  try {
    entries = fs.readdirSync(CONTENT_DIR, { withFileTypes: true });
  } catch {
    return index; // content repo absent — every lookup simply misses
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(CONTENT_DIR, entry.name, 'content');
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue; // roadmap with no offline content
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const at = file.lastIndexOf('@');
      if (at < 0) continue;
      const nodeId = file.slice(at + 1, -3); // drop the '@' prefix and '.md'
      if (nodeId) index.set(`${entry.name}|${nodeId}`, path.join(dir, file));
    }
  }
  return index;
}

function contentIndex() {
  if (!contentPathIndex) contentPathIndex = buildContentPathIndex();
  return contentPathIndex;
}

/** Read one indexed file through the body cache. */
function readCached(file) {
  if (!contentTextCache) contentTextCache = new Map();
  let text = contentTextCache.get(file);
  if (text === undefined) {
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      text = null;
    }
    contentTextCache.set(file, text);
  }
  return text;
}

/**
 * Read every indexed file into the body cache. Optional — a full-text search
 * warms it anyway; this just moves the one-off cost off the first query.
 * @returns {number} entries cached
 */
export function warmContentCache() {
  for (const file of contentIndex().values()) readCached(file);
  return contentTextCache.size;
}

/**
 * Find content markdown for a node. Files look like `label@nodeId.md`
 * inside developer-roadmap/roadmaps/<slug>/content/.
 */
export function findNodeContent(slug, nodeId) {
  if (!isSafeSlug(slug) || !isSafeNodeId(nodeId)) return null;
  const file = contentIndex().get(`${slug}|${nodeId}`);
  return file ? readCached(file) : null;
}

/* ----------------------------- quest progress ---------------------------- */

/**
 * Read quest progress from state: slug -> { units: Record<string, number>, updatedAt: string }
 */
export function getQuestProgress(slug) {
  const state = loadState();
  const all = state.questProgress || {};
  return slug ? (all[slug] || null) : all;
}

/**
 * Update quest progress for a specific unit or quest.
 * @param {string} slug quest slug (e.g. 'data-structures-and-algorithms-quest')
 * @param {string|number} unitId unit id
 * @param {{action?: string, levels?: number, maxLevels?: number}} options
 */
export function updateQuestProgress(slug, unitId, { action = 'increment', levels = 1, maxLevels = 1 } = {}) {
  return mutateState((state) => {
    if (!state.questProgress) state.questProgress = {};
    if (!state.questProgress[slug]) {
      state.questProgress[slug] = { units: {}, updatedAt: new Date().toISOString() };
    }
    const qp = state.questProgress[slug];
    if (!qp.units) qp.units = {};
    const uKey = String(unitId);
    const current = Number(qp.units[uKey]) || 0;
    const max = Number(maxLevels) || 1;

    let next = current;
    if (action === 'increment') next = current + (Number(levels) || 1);
    else if (action === 'decrement') next = current - (Number(levels) || 1);
    else if (action === 'set') next = Number(levels) || 0;
    else if (action === 'complete_unit') next = max;
    else if (action === 'reset') next = 0;

    qp.units[uKey] = Math.max(0, Math.min(next, max));
    qp.updatedAt = new Date().toISOString();
  });
}

/* ----------------------------- leetcode ratings -------------------------- */

export function getLeetCodeRatings() {
  const state = loadState();
  return state.leetcodeRatings || {};
}

export function rateLeetCodeProblem(slug, payload) {
  let result;
  mutateState((state) => {
    if (!state.leetcodeRatings) state.leetcodeRatings = {};
    const existing = state.leetcodeRatings[slug] || { attempts: 0, totalTime: 0, solved: false };

    // If an outcome is provided, it's a submission, so increment attempts.
    const isSubmit = !!payload.outcome;
    const attempts = existing.attempts + (isSubmit ? 1 : 0);
    const totalTime = existing.totalTime + (payload.timeSeconds || 0);
    const averageTimePerAttempt = attempts > 0 ? Math.round(totalTime / attempts) : 0;
    const solved = existing.solved || payload.outcome === 'accepted';

    state.leetcodeRatings[slug] = {
      rating: payload.rating ?? existing.rating,
      title: payload.title || existing.title,
      difficulty: payload.difficulty || existing.difficulty,
      attempts,
      totalTime,
      averageTimePerAttempt,
      solved,
      notes: payload.notes !== undefined ? payload.notes : existing.notes,
      updatedAt: new Date().toISOString(),
    };
    result = state.leetcodeRatings[slug];
  });
  return result;
}

/* --------------------------- study plan progress -------------------------- */

export function getStudyPlanProgress() {
  const state = loadState();
  return state.studyPlanProgress || {};
}

export function markStudyPlanProblem(planSlug, problemSlug, done) {
  mutateState((state) => {
    if (!state.studyPlanProgress) state.studyPlanProgress = {};
    if (!state.studyPlanProgress[planSlug]) {
      state.studyPlanProgress[planSlug] = { completedProblems: [], lastUpdated: null };
    }
    const p = state.studyPlanProgress[planSlug];
    if (!Array.isArray(p.completedProblems)) p.completedProblems = [];
    const idx = p.completedProblems.indexOf(problemSlug);
    if (done && idx === -1) p.completedProblems.push(problemSlug);
    if (!done && idx !== -1) p.completedProblems.splice(idx, 1);
    p.lastUpdated = new Date().toISOString();
  });
}

/* --------------------------- neetcode progress ---------------------------- */

export function getNeetcodeProgress() {
  const state = loadState();
  return state.neetcodeProgress || { completedProblems: [], lastUpdated: null };
}

export function markNeetcodeProblem(code, done) {
  let updated;
  mutateState((state) => {
    if (!state.neetcodeProgress) {
      state.neetcodeProgress = { completedProblems: [], lastUpdated: null };
    }
    const p = state.neetcodeProgress;
    if (!Array.isArray(p.completedProblems)) p.completedProblems = [];
    const idx = p.completedProblems.indexOf(code);
    if (done && idx === -1) p.completedProblems.push(code);
    if (!done && idx !== -1) p.completedProblems.splice(idx, 1);
    p.lastUpdated = new Date().toISOString();
    updated = p;
  });
  return updated;
}

/* --------------------------- euler progress ------------------------------- */

export function getEulerProgress() {
  const state = loadState();
  return state.projectEulerProgress || { completedProblems: [], lastUpdated: null };
}

export function markEulerProblem(id, done) {
  let updated;
  const numId = Number(id);
  mutateState((state) => {
    if (!state.projectEulerProgress) {
      state.projectEulerProgress = { completedProblems: [], lastUpdated: null };
    }
    const p = state.projectEulerProgress;
    if (!Array.isArray(p.completedProblems)) p.completedProblems = [];
    const idx = p.completedProblems.indexOf(numId);
    if (done && idx === -1) p.completedProblems.push(numId);
    if (!done && idx !== -1) p.completedProblems.splice(idx, 1);
    p.completedProblems.sort((a, b) => a - b);
    p.lastUpdated = new Date().toISOString();
    updated = p;
  });
  return updated;
}


