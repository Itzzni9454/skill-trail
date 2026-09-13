import { loadEnv } from './env.js';
loadEnv();
/**
 * Skill Trail — local API server.
 *
 * Serves roadmap JSON + topic content + user progress + custom roadmaps.
 * Data lives in data/roadmaps/*.json (official snapshots) and data/state.json.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listRoadmapFiles,
  loadRoadmap,
  loadState,
  saveState,
  mutateState,
  findNodeContent,
  warmContentCache,
  REVIEW_INTERVAL_DAYS,
  REVIEW_GRADES,
  normalizeReviewEntry,
  reviewDateKey,
  reviewIntervalFor,
  getQuestProgress,
  updateQuestProgress,
  getLeetCodeRatings,
  rateLeetCodeProblem,
  getStudyPlanProgress,
  markStudyPlanProblem,
  getNeetcodeProgress,
  markNeetcodeProblem,
  getEulerProgress,
  markEulerProblem,
} from './store.js';
import {
  getProfile as getHabiticaProfile,
  getTasks as getHabiticaTasks,
  createTask as createHabiticaTask,
  scoreTask as scoreHabiticaTask,
  deleteTask as deleteHabiticaTask,
  ensureDefaultDailies as ensureHabiticaDailies,
  syncHabiticaToRoadmap,
  isHabiticaConfigured,
} from './habitica.js';
import {
  getCalendarStatus,
  syncFreeSlotsSchedule,
  isCalendarConfigured,
} from './gcalendar.js';
import { CONNECTORS, describeAll, flush, flushAll, loadConnectors, saveConnectors, recordCompletion } from './connectors.js';
import { cacheStatus as leetcodeCacheStatus, resolveProblem } from './leetcode.js';
import {
  addDefinition,
  clearToday,
  getBoard,
  getCompletion,
  getHistory,
  getStats,
  listDefinitions,
  recordAttempt,
  removeDefinition,
  updateDefinition,
  rerollDaily,
} from './dailys.js';
import { generateFlatBadge, generateCardBadge } from './badge.js';
import { generateAnkiDeck } from './anki.js';
import { getAllStudyPlansWithProgress, getStudyPlanWithProgress, STUDY_PLANS } from './studyplans.js';
import { getNeetcodePatternsWithProgress, getRandomNeetcodeProblem } from './neetcode.js';
import {
  getEulerProblemsWithProgress,
  getEulerCacheStatus,
  syncEulerProblems,
  getEulerProblemContent,
} from './euler.js';

/** @type {{at:number, data:any}|null} in-memory cache for full roadmap JSON */
let roadmapCache = { at: 0, data: null };

/**
 * Load every roadmap JSON (official + custom), caching for the lifetime of the
 * process. Roadmap snapshots only change via the updater; progress lives in
 * state.json, so a process-lifetime cache is safe and keeps search fast.
 * Custom roadmaps mutate through the API — every mutation MUST call
 * invalidateRoadmapCache() so the next getAllRoadmaps() sees the change.
 */
function getAllRoadmaps() {
  if (roadmapCache.data) return roadmapCache.data;
  const state = loadState();
  const official = listRoadmapFiles().map((f) => ({
    slug: f.slug,
    ...loadRoadmap(f.slug),
  }));
  const customs = (state.customRoadmaps || []).map((c) => ({
    slug: 'custom:' + c.slug,
    ...c,
  }));
  roadmapCache = { at: Date.now(), data: [...official, ...customs] };
  return roadmapCache.data;
}

/** Drop the cached roadmap list (call after any custom-roadmap mutation). */
function invalidateRoadmapCache() {
  roadmapCache = { at: 0, data: null };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '10mb' }));

const STATUSES = ['learning', 'done', 'skipped'];
/** Streak milestone days celebrated with a toast. */
const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

/** allowed theme values */
const THEMES = ['light', 'paper', 'dark', 'midnight'];
/**
 * Themes retired in the 2026-09 redesign, mapped to their closest survivor so a
 * stored preference migrates instead of silently resetting to the default.
 */
const LEGACY_THEMES = {
  solar: 'paper',
  forest: 'light',
  ocean: 'light',
  sunset: 'paper',
  mono: 'light',
  amber: 'paper',
  teal: 'light',
  cherry: 'paper',
  stitch: 'midnight',
};
/** default theme for new installs */
const DEFAULT_THEME = 'light';

/** Normalize any stored theme value to a supported one. */
function normalizeTheme(value) {
  const name = String(value ?? '');
  if (THEMES.includes(name)) return name;
  return LEGACY_THEMES[name] || DEFAULT_THEME;
}

/** Whether topics done in another roadmap count toward done-stats (default on). */
function countCoveredEnabled(state) {
  return state.settings?.countCoveredAsDone !== false;
}

/** Normalized label key for a node — must match the cross-progress endpoint. */
const labelKey = (n) => String(n.data?.label || '').trim().toLowerCase().replace(/\s+/g, ' ');

/* ------------------------------- roadmaps ------------------------------- */

/**
 * Done-topic label sets per roadmap (normalized), for covered counting.
 * Returns { bySlug, union } where union merges every set.
 */
function doneLabelSets(allRoadmaps, nodeProgress) {
  const bySlug = {};
  for (const rm of allRoadmaps) {
    const prog = nodeProgress[rm.slug] || {};
    const labels = new Set();
    for (const n of rm.nodes || []) {
      if (!['topic', 'subtopic'].includes(n.type)) continue;
      if (prog[n.id] === 'done') {
        const key = labelKey(n);
        if (key) labels.add(key);
      }
    }
    if (labels.size) bySlug[rm.slug] = labels;
  }
  const union = new Set();
  for (const set of Object.values(bySlug)) {
    for (const l of set) union.add(l);
  }
  return { bySlug, union };
}

/** Covered count for one roadmap: unmarked topic/subtopic nodes whose label
 *  is done in some OTHER roadmap. */
function coveredCountFor(rm, progress, othersUnion) {
  if (!othersUnion || !othersUnion.size) return 0;
  let covered = 0;
  for (const n of rm.nodes || []) {
    if (!['topic', 'subtopic'].includes(n.type)) continue;
    if (progress[n.id]) continue; // local status wins
    if (othersUnion.has(labelKey(n))) covered++;
  }
  return covered;
}

// Summary list for home page / universe picker
app.get('/api/roadmaps', (req, res) => {
  const state = loadState();
  const countCovered = countCoveredEnabled(state);
  const files = listRoadmapFiles();
  const official = files.map(({ slug, mtime }) => ({ slug, ...loadRoadmap(slug), _mtime: mtime }));
  const customs = (state.customRoadmaps || []).map((c) => ({ slug: 'custom:' + c.slug, nodes: c.nodes || [], title: c.title, description: c.description, updatedAt: c.updatedAt || null }));
  const { bySlug: doneSets } = countCovered
    ? doneLabelSets([...official, ...customs], state.nodeProgress || {})
    : { bySlug: {} };
  /**
   * How many roadmaps have each label done. This lets us answer "is this label
   * done *elsewhere*?" for one roadmap in O(labels), instead of re-scanning every
   * other roadmap's set each time (which made this O(roadmaps²)).
   */
  const labelCount = new Map();
  if (countCovered) {
    for (const set of Object.values(doneSets)) {
      for (const l of set) labelCount.set(l, (labelCount.get(l) || 0) + 1);
    }
  }
  /**
   * Labels done in some OTHER roadmap. A label done here *and* elsewhere still
   * counts as done elsewhere, so subtract this roadmap's own contribution from
   * the count — do NOT just delete the label from the union.
   */
  const othersUnionFor = (slug) => {
    if (!countCovered || !labelCount.size) return null;
    const own = doneSets[slug];
    if (!own || !own.size) return new Set(labelCount.keys());
    const out = new Set();
    for (const [label, n] of labelCount) {
      if (n - (own.has(label) ? 1 : 0) > 0) out.add(label);
    }
    return out;
  };
  const list = official.map(({ slug, _mtime, ...rm }) => {
    const interactive = (rm?.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );
    const progress = state.nodeProgress[slug] || {};
    let nodeCount = 0;
    let done = 0;
    for (const n of interactive) {
      if (n.type === 'checklist' && Array.isArray(n.data?.checklists) && n.data.checklists.length) {
        nodeCount += n.data.checklists.length;
        for (const item of n.data.checklists) {
          if (progress[item.id] === 'done') done++;
        }
      } else {
        nodeCount += 1;
        if (progress[n.id] === 'done') done++;
      }
    }
    const covered = countCovered ? coveredCountFor(rm, progress, othersUnionFor(slug)) : 0;
    return {
      slug,
      title: rm?.title?.page || rm?.title?.card || slug,
      cardTitle: rm?.title?.card || slug,
      description: rm?.description || '',
      nodeCount,
      doneCount: done + covered,
      coveredCount: covered,
      updatedAt: rm?.updatedAt || new Date(_mtime).toISOString(),
      isCustom: false,
    };
  });
  // custom roadmaps too
  for (const c of customs) {
    const nodes = (c.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );
    const progress = state.nodeProgress[c.slug] || {};
    let nodeCount = 0;
    let done = 0;
    for (const n of nodes) {
      if (n.type === 'checklist' && Array.isArray(n.data?.checklists) && n.data.checklists.length) {
        nodeCount += n.data.checklists.length;
        for (const item of n.data.checklists) {
          if (progress[item.id] === 'done') done++;
        }
      } else {
        nodeCount += 1;
        if (progress[n.id] === 'done') done++;
      }
    }
    const covered = countCovered ? coveredCountFor(c, progress, othersUnionFor(c.slug)) : 0;
    list.push({
      slug: c.slug,
      title: c.title,
      cardTitle: c.title,
      description: c.description || '',
      nodeCount,
      doneCount: done + covered,
      coveredCount: covered,
      updatedAt: c.updatedAt,
      isCustom: true,
    });
  }
  list.sort((a, b) => a.title.localeCompare(b.title));
  res.json(list);
});

// Full roadmap JSON (official schema) — custom roadmaps are stored in the same schema
app.get('/api/roadmaps/:slug', (req, res) => {
  const slug = req.params.slug;
  let data;
  if (slug.startsWith('custom:')) {
    const customSlug = slug.slice(7);
    const state = loadState();
    const c = (state.customRoadmaps || []).find((r) => r.slug === customSlug);
    if (!c) return res.status(404).json({ error: 'Roadmap not found' });
    data = c;
  } else {
    data = loadRoadmap(slug);
    if (!data) return res.status(404).json({ error: 'Roadmap not found' });
  }
  res.json(data);
});

/* ------------------------------ review queue ----------------------------- */

/** Store key for one scheduled review. `|` can't appear in slugs or node ids. */
const reviewKey = (slug, nodeId) => `${slug}|${nodeId}`;

/** Read + normalize all review entries, skipping malformed ones. */
function getReviewEntries(state) {
  const out = [];
  for (const [key, raw] of Object.entries(state.reviewSchedule || {})) {
    const entry = normalizeReviewEntry(raw);
    if (entry) out.push({ key, ...entry });
  }
  return out;
}

/** Due when dueAt <= end of today (today's items included — review them today). */
function isDue(entry, now = new Date()) {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return Date.parse(entry.dueAt) <= endOfToday.getTime();
}

/** Register the review ladder for a topic that was just marked done. */
function scheduleReview(state, slug, nodeId) {
  state.reviewSchedule = state.reviewSchedule || {};
  state.reviewSchedule[reviewKey(slug, nodeId)] = {
    stage: 0,
    dueAt: new Date(Date.now() + REVIEW_INTERVAL_DAYS[0] * 86400000).toISOString(),
    doneAt: new Date().toISOString(),
  };
}

/** Readable label for a node, falling back to its id when it isn't a topic. */
function topicLabel(slug, nodeId) {
  const rm = getAllRoadmaps().find((r) => r.slug === slug);
  const n = rm?.nodes?.find((x) => x.id === nodeId);
  return String(n?.data?.label || nodeId);
}

/**
 * Due/overdue reviews with readable labels, plus what's coming up.
 *
 * `?scope=all` folds upcoming items into `due` so you can practise early.
 * Without it the queue sits empty for the entire first day after marking a
 * topic done — reviews are scheduled one day out, so a fresh user saw a Review
 * screen that never had anything in it and read it as broken.
 */
app.get('/api/reviews', (req, res) => {
  const state = loadState();
  const now = new Date();
  const scopeAll = req.query.scope === 'all';
  const due = [];
  const upcoming = [];

  for (const entry of getReviewEntries(state)) {
    const [slug, nodeId] = entry.key.split('|');
    let label = nodeId;
    for (const rm of getAllRoadmaps()) {
      if (rm.slug !== slug) continue;
      const n = (rm.nodes || []).find((x) => x.id === nodeId);
      if (n?.data?.label) label = String(n.data.label);
      break;
    }
    const item = {
      slug,
      nodeId,
      label,
      stage: entry.stage,
      intervalDays: reviewIntervalFor(entry.stage),
      dueAt: entry.dueAt,
    };

    if (isDue(entry, now)) {
      due.push({
        ...item,
        overdueDays: Math.max(
          0,
          Math.floor((now.getTime() - Date.parse(entry.dueAt)) / 86400000),
        ),
        early: false,
        hoursUntil: 0,
      });
    } else {
      const hoursUntil = Math.max(
        0,
        Math.round((Date.parse(entry.dueAt) - now.getTime()) / 3600000),
      );
      const up = { ...item, overdueDays: 0, hoursUntil, early: true };
      upcoming.push(up);
      if (scopeAll) due.push(up);
    }
  }

  const byDue = (a, b) =>
    Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.label.localeCompare(b.label);
  due.sort(byDue);
  upcoming.sort(byDue);

  res.json({
    due,
    /** Soonest upcoming review, so the UI can say when to come back. */
    nextUpcoming: upcoming[0] || null,
    upcomingCount: upcoming.length,
    intervals: REVIEW_INTERVAL_DAYS,
  });
});

function formatICSDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 iCalendar feed for scheduled spaced repetition reviews */
app.get('/api/calendar.ics', (req, res) => {
  const state = loadState();
  const entries = getReviewEntries(state);
  const roadmaps = getAllRoadmaps();

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RoadmapToMindmap//ReviewCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Roadmap Spaced Repetition Reviews',
    'X-WR-TIMEZONE:UTC',
  ];

  for (const entry of entries) {
    const [slug, nodeId] = entry.key.split('|');
    let label = nodeId;
    let rmTitle = slug;
    for (const rm of roadmaps) {
      if (rm.slug !== slug) continue;
      rmTitle = rm.title?.page || rm.title || slug;
      const n = (rm.nodes || []).find((x) => x.id === nodeId);
      if (n?.data?.label) label = String(n.data.label);
      break;
    }

    const due = new Date(entry.dueAt);
    const startStr = formatICSDate(due);
    const endStr = formatICSDate(new Date(due.getTime() + 30 * 60 * 1000));
    const nowStr = formatICSDate(new Date());
    const uid = `review-${slug}-${nodeId}-${entry.stage}@roadmap-to-mindmap`;

    ics.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:Spaced Review: ${label} (${rmTitle})`,
      `DESCRIPTION:Spaced repetition review due for topic "${label}". Stage: ${entry.stage + 1}/6.`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  ics.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="roadmap-reviews.ics"');
  res.send(ics.join('\r\n'));
});


/** Answer a review. grade=good advances the ladder, again repeats the current
 *  interval, dismiss removes the schedule. Progress status is never touched. */
app.post('/api/reviews/:slug/:nodeId/answer', (req, res) => {
  const { slug, nodeId } = req.params;
  const { grade } = req.body || {};
  if (!REVIEW_GRADES.includes(grade)) {
    return res.status(400).json({ error: `grade must be one of ${REVIEW_GRADES.join(', ')}` });
  }
  if (grade === 'dismiss') {
    let existed = false;
    mutateState((s) => {
      const key = reviewKey(slug, nodeId);
      if (s.reviewSchedule?.[key]) {
        delete s.reviewSchedule[key];
        existed = true;
      }
    });
    return res.json({ ok: true, removed: existed });
  }
  // Answering a topic with no scheduled review is a 404, not a crash. The entry
  // is checked *before* mutating so a rejected request never writes state.
  const key = reviewKey(slug, nodeId);
  if (!normalizeReviewEntry(loadState().reviewSchedule?.[key])) {
    return res.status(404).json({ error: 'No review scheduled for this topic' });
  }
  let result = null;
  mutateState((s) => {
    const entry = normalizeReviewEntry(s.reviewSchedule?.[key]);
    if (!entry) return; // unreachable — guarded above; keeps the callback total
    let nextStage = entry.stage;
    let nextDelayDays = reviewIntervalFor(entry.stage);

    if (grade === 'again') {
      nextStage = 0;
      nextDelayDays = 1;
    } else if (grade === 'hard') {
      nextStage = Math.max(0, entry.stage);
      nextDelayDays = Math.max(1, Math.floor(reviewIntervalFor(entry.stage) * 0.6));
    } else if (grade === 'good') {
      nextStage = entry.stage + 1;
      nextDelayDays = reviewIntervalFor(nextStage);
    } else if (grade === 'easy') {
      nextStage = Math.min(REVIEW_INTERVAL_DAYS.length - 1, entry.stage + 2);
      nextDelayDays = reviewIntervalFor(nextStage) * 1.3;
    }

    s.reviewSchedule[key] = {
      stage: nextStage,
      dueAt: new Date(Date.now() + nextDelayDays * 86400000).toISOString(),
      doneAt: entry.doneAt,
      lastReviewedAt: new Date().toISOString(),
    };
    result = {
      stage: nextStage,
      graduated: nextStage >= REVIEW_INTERVAL_DAYS.length - 1,
      nextDueAt: s.reviewSchedule[key].dueAt,
      nextIntervalDays: nextDelayDays,
    };
  });
  if (!result) return res.status(404).json({ error: 'No review scheduled for this topic' });
  res.json({ ok: true, ...result });
});

/** Snooze every due review by N days (default 1). Handy for holidays. */
app.post('/api/reviews/snooze-all', (req, res) => {
  const days = Number(req.body?.days ?? 1);
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    return res.status(400).json({ error: 'days must be between 1 and 30' });
  }
  let moved = 0;
  mutateState((s) => {
    const now = new Date();
    for (const entry of getReviewEntries(s)) {
      if (!isDue(entry, now)) continue;
      s.reviewSchedule[entry.key].dueAt = new Date(
        Date.parse(entry.dueAt) + days * 86400000,
      ).toISOString();
      moved++;
    }
  });
  res.json({ ok: true, moved });
});

/* ------------------------------ cross progress --------------------------- */

/**
 * Done-topic labels per roadmap, enabling "covered" (done elsewhere) display.
 * Progress is per-(slug,nodeId), but topic names are stable across roadmaps —
 * so a topic done in any roadmap can mark its label-covered in all others.
 */
app.get('/api/cross-progress', (req, res) => {
  const state = loadState();
  const doneLabelsBySlug = {};
  for (const [slug, prog] of Object.entries(state.nodeProgress || {})) {
    const rm = getAllRoadmaps().find((r) => r.slug === slug);
    if (!rm) continue; // progress for a roadmap that no longer exists
    const labels = new Set();
    for (const n of rm.nodes || []) {
      if (prog[n.id] !== 'done') continue;
      const label = String(n.data?.label || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (label) labels.add(label);
    }
    if (labels.size) doneLabelsBySlug[slug] = [...labels];
  }
  res.json({ doneLabelsBySlug });
});

/* -------------------------------- content ------------------------------- */

app.get('/api/roadmaps/:slug/node/:nodeId/content', (req, res) => {
  const { slug, nodeId } = req.params;
  if (slug.startsWith('custom:')) {
    return res.json({ content: null }); // custom nodes have no official content
  }
  const content = findNodeContent(slug, nodeId);
  res.json({ content });
});

/* -------------------------------- progress ------------------------------ */

/* --------------------------- global topic search ------------------------- */

/** Search topic titles across ALL roadmaps. `?q=` required, min 2 chars. */
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ results: [] });
  const roadmapName = Object.fromEntries(
    getAllRoadmaps().map((rm) => [rm.slug, rm.title?.page || rm.title?.card || rm.slug]),
  );
  const results = [];
  for (const rm of getAllRoadmaps()) {
    for (const n of rm.nodes || []) {
      if (!['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type)) continue;
      const label = String(n.data?.label || '').trim();
      if (label) {
        const lower = label.toLowerCase();
        if (lower.includes(q)) {
          results.push({
            roadmapSlug: rm.slug,
            roadmapTitle: roadmapName[rm.slug] || rm.slug,
            nodeId: n.id,
            label,
            score: lower === q ? 0 : lower.startsWith(q) ? 1 : 2,
          });
          if (results.length >= 200) break;
        }
      }
      if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
        for (const item of n.data.checklists) {
          const itemLabel = String(item.label || '').trim();
          if (!itemLabel) continue;
          const lowerItem = itemLabel.toLowerCase();
          if (lowerItem.includes(q)) {
            results.push({
              roadmapSlug: rm.slug,
              roadmapTitle: roadmapName[rm.slug] || rm.slug,
              nodeId: item.id || n.id,
              label: itemLabel,
              score: lowerItem === q ? 0 : lowerItem.startsWith(q) ? 1 : 2,
            });
            if (results.length >= 200) break;
          }
        }
      }
    }
    if (results.length >= 200) break;
  }
  // best matches first, then alphabetical for stable ordering
  results.sort(
    (a, b) => a.score - b.score || a.label.localeCompare(b.label) || a.roadmapTitle.localeCompare(b.roadmapTitle),
  );
  res.json({ results });
});

/**
 * Server-side Full-Text Search across topic titles, guide content (markdown),
 * and user notes. `?q=` required.
 */
app.get('/api/search/fulltext', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ results: [] });

  const state = loadState();
  const allRoadmaps = getAllRoadmaps();
  const roadmapName = Object.fromEntries(
    allRoadmaps.map((rm) => [rm.slug, rm.title?.page || rm.title?.card || rm.slug]),
  );

  const results = [];
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  for (const rm of allRoadmaps) {
    const slug = rm.slug;
    const notesForSlug = state.nodeNotes?.[slug] || {};

    for (const n of rm.nodes || []) {
      if (!['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type)) continue;
      const label = String(n.data?.label || '').trim();
      const userNote = notesForSlug[n.id] || '';

      let matchType = null;
      let excerpt = '';
      let score = 5;

      const lowerLabel = label.toLowerCase();
      if (lowerLabel.includes(q)) {
        matchType = 'title';
        score = lowerLabel === q ? 0 : lowerLabel.startsWith(q) ? 1 : 2;
        excerpt = label;
      } else if (userNote.toLowerCase().includes(q)) {
        matchType = 'note';
        score = 3;
        const idx = userNote.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(userNote.length, idx + q.length + 60);
        excerpt = (start > 0 ? '…' : '') + userNote.slice(start, end).replace(/\n/g, ' ') + (end < userNote.length ? '…' : '');
      } else {
        const content = findNodeContent(slug, n.id);
        if (content && content.toLowerCase().includes(q)) {
          matchType = 'content';
          score = 4;
          const idx = content.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 40);
          const end = Math.min(content.length, idx + q.length + 60);
          excerpt = (start > 0 ? '…' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '…' : '');
        }
      }

      if (matchType) {
        results.push({
          roadmapSlug: slug,
          roadmapTitle: roadmapName[slug] || slug,
          nodeId: n.id,
          label: label || n.id,
          matchType,
          excerpt,
          score,
        });
        if (results.length >= limit * 2) break;
      }

      if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
        for (const item of n.data.checklists) {
          const itemLabel = String(item.label || '').trim();
          if (!itemLabel) continue;
          const lowerItem = itemLabel.toLowerCase();
          if (lowerItem.includes(q)) {
            results.push({
              roadmapSlug: slug,
              roadmapTitle: roadmapName[slug] || slug,
              nodeId: item.id || n.id,
              label: itemLabel,
              matchType: 'title',
              excerpt: itemLabel,
              score: lowerItem === q ? 0 : lowerItem.startsWith(q) ? 1 : 2,
            });
            if (results.length >= limit * 2) break;
          }
        }
      }
    }
    if (results.length >= limit * 2) break;
  }

  results.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  res.json({ results: results.slice(0, limit) });
});

/* --------------------------------- notes --------------------------------- */

app.get('/api/notes/:slug', (req, res) => {
  const state = loadState();
  res.json({ notes: state.nodeNotes?.[req.params.slug] || {} });
});

app.post('/api/notes/:slug', (req, res) => {
  const { nodeId, note } = req.body || {};
  if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
  if (note != null && typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string or null' });
  }
  mutateState((s) => {
    s.nodeNotes = s.nodeNotes || {};
    s.nodeNotes[req.params.slug] = s.nodeNotes[req.params.slug] || {};
    if (note == null || !note.trim()) delete s.nodeNotes[req.params.slug][nodeId];
    else s.nodeNotes[req.params.slug][nodeId] = note.slice(0, 10000);
  });
  res.json({ ok: true });
});

/* ----------------------------- time tracking ----------------------------- */

app.get('/api/time', (req, res) => {
  const state = loadState();
  res.json({ timeTracked: state.timeTracked || {} });
});

app.post('/api/time/:slug/:nodeId', (req, res) => {
  const { slug, nodeId } = req.params;
  const { seconds, mode } = req.body || {};
  if (!Number.isFinite(seconds) || seconds < 0) return res.status(400).json({ error: 'seconds required' });
  let total = 0;
  mutateState((s) => {
    s.timeTracked = s.timeTracked || {};
    s.timeTracked[slug] = s.timeTracked[slug] || {};
    if (mode === 'set') {
      s.timeTracked[slug][nodeId] = seconds;
    } else {
      s.timeTracked[slug][nodeId] = (s.timeTracked[slug][nodeId] || 0) + seconds;
    }
    total = s.timeTracked[slug][nodeId];
  });
  res.json({ ok: true, total });
});

/* --------------------------- streaks + heatmap ---------------------------- */

// Date keys use reviewDateKey() from ./store.js — the local duplicate that used
// to live here was byte-identical to it.

/** Current streak: consecutive active days ending today (or yesterday — a
 *  streak is only broken after a full missed day). */
function computeCurrentStreak(days) {
  const daySet = new Set(Object.keys(days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)));
  let streak = 0;
  const cursor = new Date();
  if (!daySet.has(reviewDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (daySet.has(reviewDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Streak/heatmap stats derived from per-day study activity. */
app.get('/api/streaks', (req, res) => {
  const state = loadState();
  // one-time seed: derive day counts from the legacy activity log if present
  if (!state.activityByDay && Array.isArray(state.activity) && state.activity.length) {
    const byDay = {};
    for (const ev of state.activity) {
      if (ev.type !== 'node-status' || !ev.at) continue;
      const key = reviewDateKey(new Date(ev.at));
      byDay[key] = (byDay[key] || 0) + 1;
    }
    state.activityByDay = byDay;
    saveState(state);
  }
  const days = state.activityByDay || {};
  const dates = Object.keys(days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const currentStreak = computeCurrentStreak(days);

  // longest streak: DST-proof via UTC day numbers
  const dayNum = (key) => {
    const [y, m, dd] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, dd) / 86400000;
  };
  let longestStreak = 0;
  let run = 0;
  let prevNum = null;
  for (const key of dates) {
    const num = dayNum(key);
    run = prevNum !== null && num - prevNum === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prevNum = num;
  }

  const settings = state.settings || {};
  const dailyGoal = Number.isInteger(settings.dailyGoal) && settings.dailyGoal > 0 ? settings.dailyGoal : 5;
  // next milestone above the current streak (null once 365 is passed)
  const nextMilestone = MILESTONES.find((m) => m > currentStreak) ?? null;

  res.json({
    currentStreak,
    longestStreak,
    activeDays: dates.length,
    totalActions: Object.values(days).reduce((a, b) => a + b, 0),
    dailyGoal,
    todayCount: days[reviewDateKey()] || 0,
    nextMilestone,
    days,
  });
});

/* -------------------------------- settings ------------------------------- */

app.get('/api/settings', (req, res) => {
  const state = loadState();
  const settings = state.settings || {};
  res.json({
    dailyGoal:
      Number.isInteger(settings.dailyGoal) && settings.dailyGoal > 0 ? settings.dailyGoal : 5,
    countCoveredAsDone: countCoveredEnabled(state),
    theme: normalizeTheme(settings.theme),
  });
});

app.post('/api/settings/count-covered', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }
  mutateState((s) => {
    s.settings = s.settings || {};
    s.settings.countCoveredAsDone = enabled;
  });
  res.json({ ok: true, countCoveredAsDone: enabled });
});

app.post('/api/settings/theme', (req, res) => {
  const { theme } = req.body || {};
  if (!THEMES.includes(theme)) {
    return res.status(400).json({ error: `theme must be one of ${THEMES.join(', ')}` });
  }
  mutateState((s) => {
    s.settings = s.settings || {};
    s.settings.theme = theme;
  });
  res.json({ ok: true, theme });
});

app.post('/api/settings/daily-goal', (req, res) => {
  const { goal } = req.body || {};
  const n = Number(goal);
  if (!Number.isInteger(n) || n < 1 || n > 1000) {
    return res.status(400).json({ error: 'goal must be an integer between 1 and 1000' });
  }
  mutateState((s) => {
    s.settings = s.settings || {};
    s.settings.dailyGoal = n;
  });
  res.json({ ok: true, dailyGoal: n });
});

/* ------------------------------ activity feed ----------------------------- */

app.get('/api/activity', (req, res) => {
  const state = loadState();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ events: (state.activity || []).slice(-limit).reverse() });
});

app.post('/api/progress/node', (req, res) => {
  const { slug, nodeId, status } = req.body || {};
  if (!slug || !nodeId) return res.status(400).json({ error: 'slug and nodeId required' });
  if (status != null && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')} or null` });
  }
  /** set inside mutate when today's counter existed before the increment (null = no change) */
  let prevToday = null;
  const state = mutateState((s) => {
    if (!s.nodeProgress[slug]) s.nodeProgress[slug] = {};
    const prev = s.nodeProgress[slug][nodeId] || null;
    if (status === null || status === undefined || status === '') {
      delete s.nodeProgress[slug][nodeId];
    } else {
      s.nodeProgress[slug][nodeId] = status;
    }
    // activity log (keep last 500)
    if (prev !== (status || null)) {
      // best-effort label lookup so the timeline can show readable text
      let label = nodeId;
      for (const rm of getAllRoadmaps()) {
        if (rm.slug !== slug) continue;
        const n = (rm.nodes || []).find((x) => x.id === nodeId);
        if (n?.data?.label) label = String(n.data.label);
        break;
      }
      // mark done → start the review ladder; un-done → cancel it. Skipped and
      // learning leave any existing schedule alone.
      if (status === 'done' && prev !== 'done') {
        scheduleReview(s, slug, nodeId);
        // Fan out to any enabled third-party connector. Fire-and-forget by
        // design: a dead API must never block marking a topic done, and the
        // queue is flushed on the next sync.
        const label = topicLabel(slug, nodeId);
        recordCompletion({
          slug,
          nodeId,
          label,
          status: 'done',
          at: new Date().toISOString(),
        }).catch(() => {});
      }
      else if (status !== 'done' && prev === 'done') delete s.reviewSchedule?.[reviewKey(slug, nodeId)];
      s.activity = s.activity || [];
      s.activity.push({
        type: 'node-status',
        slug,
        nodeId,
        label,
        from: prev,
        to: status || null,
        at: new Date().toISOString(),
      });
      if (s.activity.length > 500) s.activity = s.activity.slice(-500);
      // per-day aggregate for streaks/heatmap (never trimmed, ~1 key/day).
      // Only real statuses count as "study actions" — clearing a node doesn't.
      if (status) {
        const dayKey = reviewDateKey();
        s.activityByDay = s.activityByDay || {};
        prevToday = s.activityByDay[dayKey] || 0;
        s.activityByDay[dayKey] = prevToday + 1;
      }
    }
  });
  // goal-crossing detection: fires exactly on the action that reaches the goal
  const todayCount = (state.activityByDay || {})[reviewDateKey()] || 0;
  const dailyGoal =
    Number.isInteger(state.settings?.dailyGoal) && state.settings.dailyGoal > 0
      ? state.settings.dailyGoal
      : 5;
  const goalReached = prevToday !== null && prevToday < dailyGoal && todayCount >= dailyGoal;
  // streak milestone detection: the streak only GROWS on the first action of a
  // day, and then by exactly +1 — so a milestone is hit when the new streak is
  // exactly a milestone value
  let streakMilestone = null;
  if (prevToday === 0) {
    const streak = computeCurrentStreak(state.activityByDay || {});
    if (MILESTONES.includes(streak)) streakMilestone = streak;
  }
  // Auto-complete the "4 roadmap topics" daily if threshold reached
  if (status === 'done' && todayCount >= 4) {
    try {
      recordAttempt('rm-topics', { outcome: 'done' });
    } catch (err) {
      console.warn('[server] Could not record rm-topics completion:', err.message);
    }
  }
  res.json({ ok: true, goalReached, todayCount, dailyGoal, streakMilestone });
});

app.get('/api/progress', (req, res) => {
  const state = loadState();
  res.json({ nodeProgress: state.nodeProgress, roadmapStatus: state.roadmapStatus });
});

app.post('/api/progress/roadmap', (req, res) => {
  const { slug, status } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug required' });
  mutateState((s) => {
    if (!status) delete s.roadmapStatus[slug];
    else s.roadmapStatus[slug] = status;
  });
  res.json({ ok: true });
});

// Reset all progress
app.post('/api/progress/reset', (req, res) => {
  mutateState((s) => {
    s.nodeProgress = {};
    s.roadmapStatus = {};
    s.activity = s.activity || [];
    s.activity.push({ type: 'reset', at: new Date().toISOString() });
  });
  res.json({ ok: true });
});

/* --------------------------- backup / restore ---------------------------- */

// Download everything the user has created/changed in one JSON file
app.get('/api/backup', (req, res) => {
  const state = loadState();
  res.setHeader('Content-Disposition', 'attachment; filename="roadmap-offline-backup.json"');
  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    nodeProgress: state.nodeProgress || {},
    roadmapStatus: state.roadmapStatus || {},
    nodeNotes: state.nodeNotes || {},
    customRoadmaps: state.customRoadmaps || [],
    settings: state.settings || {},
    theme: normalizeTheme(state.settings?.theme),
    reviewSchedule: state.reviewSchedule || {},
    activity: state.activity || [],
    timeTracked: state.timeTracked || {},
  });
});

// Restore a backup produced by /api/backup.
// mode=merge (default): keeps existing progress; mode=replace: wipes first.
app.post('/api/backup/restore', (req, res) => {
  const b = req.body || {};
  if (!b || typeof b !== 'object' || !b.nodeProgress || typeof b.nodeProgress !== 'object') {
    return res.status(400).json({ error: 'Invalid backup file (nodeProgress missing)' });
  }
  const replace = b.mode === 'replace';
  mutateState((s) => {
    if (replace) {
      s.nodeProgress = {};
      s.roadmapStatus = {};
      s.nodeNotes = {};
      s.customRoadmaps = [];
      s.reviewSchedule = {};
      s.timeTracked = {};
    }
    for (const [slug, nodes] of Object.entries(b.nodeProgress || {})) {
      s.nodeProgress[slug] = { ...(s.nodeProgress[slug] || {}), ...nodes };
    }
    Object.assign(s.roadmapStatus, b.roadmapStatus || {});
    s.nodeNotes = { ...b.nodeNotes, ...(s.nodeNotes || {}) };
    
    // merge timeTracked
    if (b.timeTracked && typeof b.timeTracked === 'object') {
      s.timeTracked = s.timeTracked || {};
      for (const [slug, times] of Object.entries(b.timeTracked)) {
        if (times && typeof times === 'object') {
          s.timeTracked[slug] = { ...(s.timeTracked[slug] || {}), ...times };
        }
      }
    }

    if (b.reviewSchedule && typeof b.reviewSchedule === 'object') {
      // normalize incoming entries; malformed ones are dropped, not merged
      const clean = {};
      for (const [key, entry] of Object.entries(b.reviewSchedule)) {
        const norm = normalizeReviewEntry(entry);
        if (norm) clean[key] = norm;
      }
      s.reviewSchedule = { ...(s.reviewSchedule || {}), ...clean };
    }
    if (b.settings && typeof b.settings === 'object') {
      s.settings = Object.assign({}, s.settings, b.settings);
    }
    if (b.theme) {
      // accept retired names too, so an old backup restores to a valid theme
      s.settings = s.settings || {};
      s.settings.theme = normalizeTheme(b.theme);
    }
    // merge custom roadmaps by slug; incoming wins
    const incoming = Array.isArray(b.customRoadmaps) ? b.customRoadmaps : [];
    for (const c of incoming) {
      if (!c || typeof c !== 'object' || !c.slug) continue;
      const idx = (s.customRoadmaps || []).findIndex((x) => x.slug === c.slug);
      if (idx >= 0) s.customRoadmaps[idx] = c;
      else s.customRoadmaps.push(c);
    }
    if (replace) s.customRoadmaps = incoming.filter((c) => c && c.slug);
    s.activity = s.activity || [];
    s.activity.push({
      type: 'backup-restore',
      mode: replace ? 'replace' : 'merge',
      at: new Date().toISOString(),
    });
  });
  invalidateRoadmapCache(); // custom roadmaps may have changed
  res.json({ ok: true });
});

/* ----------------------------- custom roadmaps -------------------------- */

// Fork an official roadmap into an editable custom copy (progress included)
app.post('/api/custom-roadmaps/fork', (req, res) => {
  const { slug } = req.body || {};
  if (!slug || slug.startsWith('custom:')) return res.status(400).json({ error: 'official slug required' });
  const data = loadRoadmap(slug);
  if (!data) return res.status(404).json({ error: 'Roadmap not found' });
  const base =
    (slug || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'roadmap';
  const state = loadState();
  let finalSlug = base;
  let i = 2;
  while ((state.customRoadmaps || []).some((r) => r.slug === finalSlug)) {
    finalSlug = `${base}-${i++}`;
  }
  const copy = {
    _id: 'custom-' + Date.now(),
    slug: finalSlug,
    title: {
      page: (data.title?.page || slug) + ' (fork)',
      card: data.title?.card || data.title?.page || slug,
    },
    description: `Fork of the official "${slug}" roadmap. Edit freely — the original stays pristine and keeps receiving official updates.`,
    nodes: JSON.parse(JSON.stringify(data.nodes || [])),
    edges: JSON.parse(JSON.stringify(data.edges || [])),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isCustom: true,
    forkOf: slug,
  };
  state.customRoadmaps = state.customRoadmaps || [];
  state.customRoadmaps.push(copy);
  // carry progress over to the fork's own progress bucket
  state.nodeProgress['custom:' + finalSlug] = { ...(state.nodeProgress[slug] || {}) };
  saveState(state);
  invalidateRoadmapCache(); // fork adds a new custom roadmap
  res.json(copy);
});

app.post('/api/custom-roadmaps', (req, res) => {
  const { title, description, slug } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title required' });
  const cleanSlug =
    (slug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)) || 'custom-roadmap';
  let finalSlug = cleanSlug;
  const state = loadState();
  let i = 2;
  while ((state.customRoadmaps || []).some((r) => r.slug === finalSlug)) {
    finalSlug = `${cleanSlug}-${i++}`;
  }
  const roadmap = {
    _id: 'custom-' + Date.now(),
    slug: finalSlug,
    title: { page: title, card: title },
    description: description || '',
    nodes: [],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isCustom: true,
  };
  mutateState((s) => {
    s.customRoadmaps = s.customRoadmaps || [];
    s.customRoadmaps.push(roadmap);
  });
  invalidateRoadmapCache(); // new custom roadmap
  res.json(roadmap);
});

app.put('/api/custom-roadmaps/:slug', (req, res) => {
  const customSlug = req.params.slug;
  const { nodes, edges, title, description } = req.body || {};
  let updated = null;
  mutateState((s) => {
    const list = s.customRoadmaps || [];
    const idx = list.findIndex((r) => r.slug === customSlug);
    if (idx === -1) return;
    if (nodes !== undefined) list[idx].nodes = nodes;
    if (edges !== undefined) list[idx].edges = edges;
    if (title !== undefined) list[idx].title = { page: title, card: title };
    if (description !== undefined) list[idx].description = description;
    list[idx].updatedAt = new Date().toISOString();
    updated = list[idx];
  });
  if (!updated) return res.status(404).json({ error: 'Custom roadmap not found' });
  invalidateRoadmapCache(); // nodes/edges/title may have changed
  res.json(updated);
});

app.delete('/api/custom-roadmaps/:slug', (req, res) => {
  let ok = false;
  mutateState((s) => {
    const before = (s.customRoadmaps || []).length;
    s.customRoadmaps = (s.customRoadmaps || []).filter((r) => r.slug !== req.params.slug);
    ok = s.customRoadmaps.length < before;
  });
  if (!ok) return res.status(404).json({ error: 'Custom roadmap not found' });
  invalidateRoadmapCache(); // roadmap removed
  res.json({ ok: true });
});

/* ------------------------------- dashboard ------------------------------ */

app.get('/api/stats', (req, res) => {
  const state = loadState();
  const countCovered = countCoveredEnabled(state);
  const stats = {
    totalDone: 0,
    totalCovered: 0,
    totalLearning: 0,
    totalSkipped: 0,
    totalNodes: 0,
    totalTimeTracked: 0,
    perRoadmap: [],
    recent: [],
  };
  const files = listRoadmapFiles();
  const all = files.map((f) => ({ slug: f.slug, ...loadRoadmap(f.slug) }));
  for (const c of state.customRoadmaps || []) {
    all.push({ slug: 'custom:' + c.slug, ...c });
  }
  const { union: doneUnion } = countCovered ? doneLabelSets(all, state.nodeProgress || {}) : { union: new Set() };
  for (const rm of all) {
    const interactive = (rm.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );
    const progress = state.nodeProgress[rm.slug] || {};
    const counts = { learning: 0, done: 0, skipped: 0 };
    for (const n of interactive) {
      const st = progress[n.id];
      if (st && counts[st] !== undefined) counts[st]++;
    }
    
    // time tracking
    const rmTime = state.timeTracked?.[rm.slug] || {};
    let roadmapTimeTracked = 0;
    for (const secs of Object.values(rmTime)) {
      if (typeof secs === 'number') {
        roadmapTimeTracked += secs;
        stats.totalTimeTracked += secs;
      }
    }

    // covered: topics unmarked here but done in another roadmap — only if the
    // toggle is on. Counted over topic/subtopic (matching client display).
    const covered = countCovered ? coveredCountFor(rm, progress, doneUnion) : 0;
    stats.totalDone += counts.done;
    stats.totalCovered += covered;
    stats.totalLearning += counts.learning;
    stats.totalSkipped += counts.skipped;
    stats.totalNodes += interactive.length;
    const title = rm.title?.page || rm.title?.card || rm.slug;
    stats.perRoadmap.push({
      slug: rm.slug,
      title,
      isCustom: !!rm.isCustom,
      nodeCount: interactive.length,
      ...counts,
      coveredCount: covered,
      timeTracked: roadmapTimeTracked,
      pct: interactive.length ? Math.round(((counts.done + covered) / interactive.length) * 100) : 0,
    });
  }
  stats.perRoadmap.sort((a, b) => b.pct - a.pct || a.title.localeCompare(b.title));
  // Recent activity, same source as /api/activity, so the dashboard can render a
  // timeline without a second round-trip. (This field used to be declared and
  // never filled, behind a `return` that exited the whole handler mid-loop and
  // left the request hanging with no response.)
  stats.recent = (state.activity || []).slice(-20).reverse();
  res.json(stats);
});

/* ----------------------- habitica & google calendar ----------------------- */

app.get('/api/habitica/profile', async (_req, res) => {
  try {
    const profile = await getHabiticaProfile();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/habitica/tasks', async (req, res) => {
  try {
    const type = req.query.type || null;
    const tasks = await getHabiticaTasks(type);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/habitica/tasks', async (req, res) => {
  try {
    const created = await createHabiticaTask(req.body || {});
    res.json({ ok: true, task: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/habitica/tasks/:id/score', async (req, res) => {
  try {
    const { direction = 'up', roadmapKey } = req.body || {};
    const result = await scoreHabiticaTask(req.params.id, direction);

    // If this task corresponds to a roadmap daily, update local completion state too
    if (roadmapKey) {
      if (direction === 'up') {
        recordAttempt(roadmapKey, { outcome: 'done' });
      } else {
        clearToday(roadmapKey);
      }
    }
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/habitica/tasks/:id', async (req, res) => {
  try {
    await deleteHabiticaTask(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/habitica/sync-dailies', async (_req, res) => {
  try {
    const result = await ensureHabiticaDailies();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/calendar/status', async (_req, res) => {
  try {
    const status = await getCalendarStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/calendar/sync-free-slots', async (_req, res) => {
  try {
    const board = await getBoard();
    const tasksToSchedule = (board.dailys || []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      tag: d.kind,
      isDone: Boolean(d.doneToday),
      duration: d.id === 'rm-topics' ? 45 : 30,
      url: d.problem?.slug
        ? `https://leetcode.com/problems/${d.problem.slug}`
        : 'http://localhost:5180/#/dailys',
    }));

    // Also include uncompleted Habitica to-dos
    try {
      if (isHabiticaConfigured()) {
        const habiticaTodos = await getHabiticaTasks('todos');
        for (const t of habiticaTodos || []) {
          if (!t.completed) {
            tasksToSchedule.push({
              id: `habitica-${t.id}`,
              title: `[Habitica] ${t.text}`,
              description: t.notes || 'Habitica To-Do',
              tag: 'Habitica',
              isDone: false,
              duration: 25,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[calendar] Could not fetch Habitica todos for scheduling:', err.message);
    }

    const result = await syncFreeSlotsSchedule(tasksToSchedule);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ----------------------- github badges & anki export --------------------- */

// Dynamic SVG badge for a specific roadmap
app.get('/api/badge/:slug.svg', (req, res, next) => {
  const slug = req.params.slug;
  // `/api/badge/overall.svg` is its own route registered below, but `:slug.svg`
  // matches it first — defer instead of 404ing on a roadmap called "overall",
  // which made the overall badge unreachable.
  if (slug === 'overall') return next();
  const state = loadState();
  const rm = getAllRoadmaps().find((r) => r.slug === slug);
  if (!rm) return res.status(404).send('Roadmap not found');

  const interactive = (rm.nodes || []).filter((n) =>
    ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
  );
  const prog = state.nodeProgress[slug] || {};
  const done = interactive.filter((n) => prog[n.id] === 'done').length;
  const learning = interactive.filter((n) => prog[n.id] === 'learning').length;
  const streak = computeCurrentStreak(state.activityByDay || {});
  const title = rm.title?.page || rm.title?.card || rm.slug;

  const style = req.query.style || 'flat';
  const theme = req.query.theme || 'dark';

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (style === 'card') {
    return res.send(
      generateCardBadge({
        title,
        doneCount: done,
        totalNodes: interactive.length,
        learningCount: learning,
        streak,
        theme,
      }),
    );
  }

  const pct = interactive.length ? Math.round((done / interactive.length) * 100) : 0;
  return res.send(
    generateFlatBadge({
      label: title,
      value: `${done}/${interactive.length} (${pct}%)`,
      color: pct === 100 ? '#10b981' : pct > 50 ? '#059669' : '#0284c7',
      streak,
    }),
  );
});

// Dynamic SVG badge for overall profile progress
app.get('/api/badge/overall.svg', (req, res) => {
  const state = loadState();
  const allRoadmaps = getAllRoadmaps();

  let totalNodes = 0;
  let totalDone = 0;
  let totalLearning = 0;

  for (const rm of allRoadmaps) {
    const interactive = (rm.nodes || []).filter((n) =>
      ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
    );
    totalNodes += interactive.length;
    const prog = state.nodeProgress[rm.slug] || {};
    for (const n of interactive) {
      if (prog[n.id] === 'done') totalDone++;
      else if (prog[n.id] === 'learning') totalLearning++;
    }
  }

  const streak = computeCurrentStreak(state.activityByDay || {});
  const style = req.query.style || 'flat';
  const theme = req.query.theme || 'dark';

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (style === 'card') {
    return res.send(
      generateCardBadge({
        title: 'Developer Learning Progress',
        doneCount: totalDone,
        totalNodes,
        learningCount: totalLearning,
        streak,
        theme,
      }),
    );
  }

  const pct = totalNodes ? Math.round((totalDone / totalNodes) * 100) : 0;
  return res.send(
    generateFlatBadge({
      label: 'Learning Progress',
      value: `${totalDone} topics (${pct}%)`,
      color: '#10b981',
      streak,
    }),
  );
});

// 1-Click Anki Deck export
app.get('/api/anki/:slug/export', (req, res) => {
  const slug = req.params.slug;
  const state = loadState();
  const rm = getAllRoadmaps().find((r) => r.slug === slug);
  if (!rm) return res.status(404).send('Roadmap not found');

  const deckTsv = generateAnkiDeck(rm, state.nodeProgress, state.nodeNotes, findNodeContent);
  const safeFilename = `${slug.replace(/^custom:/, 'custom-')}-anki-deck.txt`;

  res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(deckTsv);
});

/* --------------------------- third-party connectors ---------------------- */
// Obsidian (local files), Habitica, Notion and Microsoft To Do. Everything is
// failure-tolerant: a broken or unreachable connector queues its items and
// never blocks learning.

app.get('/api/connectors', (_req, res) => {
  res.json({ connectors: describeAll() });
});

app.put('/api/connectors/:id/config', (req, res) => {
  const { id } = req.params;
  const def = CONNECTORS[id];
  if (!def) return res.status(404).json({ error: `Unknown connector: ${id}` });
  const data = loadConnectors();
  const incoming = req.body || {};
  const next = { ...(data.connectors?.[id] || {}) };
  for (const f of def.fields) {
    if (!(f.key in incoming)) continue;
    const v = incoming[f.key];
    // An empty password field means "keep whatever is already stored".
    if (f.type === 'password' && !v) continue;
    next[f.key] = v;
  }
  if ('enabled' in incoming) next.enabled = !!incoming.enabled;
  if ('syncOn' in incoming) next.syncOn = !!incoming.syncOn;
  data.connectors[id] = next;
  saveConnectors(data);
  res.json({ ok: true, connector: describeAll().find((c) => c.id === id) });
});

app.post('/api/connectors/:id/test', async (req, res) => {
  const { id } = req.params;
  const def = CONNECTORS[id];
  if (!def) return res.status(404).json({ error: `Unknown connector: ${id}` });
  const cfg = loadConnectors().connectors?.[id] || {};
  if (!def.isConfigured(cfg)) {
    return res.status(400).json({ error: 'Connector is not configured yet' });
  }
  try {
    const r = await def.testConnection(cfg);
    res.json({ ok: true, detail: r.detail || 'Connected' });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err?.message ?? err) });
  }
});

/** Retry only what is already queued. */
app.post('/api/connectors/:id/flush', async (req, res) => {
  const { id } = req.params;
  if (!CONNECTORS[id]) return res.status(404).json({ error: `Unknown connector: ${id}` });
  res.json(await flush(id));
});

app.post('/api/connectors/flush-all', async (_req, res) => {
  res.json(await flushAll());
});

/** Push every completed topic to one connector right now. */
app.post('/api/connectors/:id/sync', async (req, res) => {
  const { id } = req.params;
  const def = CONNECTORS[id];
  if (!def) return res.status(404).json({ error: `Unknown connector: ${id}` });
  const data = loadConnectors();
  const cfg = data.connectors?.[id] || {};
  if (!def.isConfigured(cfg)) {
    return res.status(400).json({ error: 'Connector is not configured yet' });
  }
  const state = loadState();
  const items = [];
  for (const [slug, prog] of Object.entries(state.nodeProgress || {})) {
    for (const [nodeId, st] of Object.entries(prog || {})) {
      if (st !== 'done') continue;
      items.push({
        slug,
        nodeId,
        label: topicLabel(slug, nodeId),
        status: 'done',
        at: new Date().toISOString(),
      });
    }
  }
  if (!items.length) return res.json({ ok: true, pushed: 0, detail: 'no completed topics to sync' });
  try {
    const r = await def.push(items, cfg);
    data.connectors[id] = { ...cfg, lastSyncAt: new Date().toISOString(), lastError: null };
    data.queue[id] = [];
    saveConnectors(data);
    res.json({ ok: true, pushed: r.pushed ?? items.length, detail: r.detail });
  } catch (err) {
    data.connectors[id] = { ...cfg, lastError: String(err?.message ?? err) };
    saveConnectors(data);
    res.status(502).json({ ok: false, error: String(err?.message ?? err) });
  }
});

app.delete('/api/connectors/:id/queue', (req, res) => {
  const { id } = req.params;
  if (!CONNECTORS[id]) return res.status(404).json({ error: `Unknown connector: ${id}` });
  const data = loadConnectors();
  data.queue[id] = [];
  saveConnectors(data);
  res.json({ ok: true });
});

/* --------------------------------- dailys --------------------------------- */

/** Today's board: every enabled daily with its resolved problem and state. */
app.get('/api/dailys/board', async (_req, res) => {
  try {
    res.json(await getBoard());
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

/** Streaks, completion rate by difficulty, trend. */
app.get('/api/dailys/stats', (_req, res) => {
  try {
    res.json(getStats());
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get('/api/dailys/history', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  res.json(
    getHistory({
      limit,
      offset,
      taskId: req.query.taskId ? String(req.query.taskId) : null,
      outcome: req.query.outcome ? String(req.query.outcome) : null,
    }),
  );
});

/** Record an attempt; an accepted/done outcome marks today complete. */
app.post('/api/dailys/:taskId/attempt', (req, res) => {
  const { taskId } = req.params;
  const { outcome, seconds, problem } = req.body || {};
  const allowed = ['accepted', 'wrong-answer', 'timeout', 'abandoned', 'done', 'attempted'];
  if (outcome && !allowed.includes(outcome)) {
    return res.status(400).json({ error: `outcome must be one of ${allowed.join(', ')}` });
  }
  const rec = recordAttempt(taskId, { outcome, seconds, problem });
  if (!rec) return res.status(404).json({ error: 'No such daily' });
  res.json({ ok: true, completion: rec });
});

app.post('/api/dailys/:taskId/clear', (req, res) => {
  res.json({ ok: clearToday(req.params.taskId) });
});

/** Refresh the problem backing one daily without recording anything. */
app.post('/api/dailys/:taskId/reroll', async (req, res) => {
  try {
    const problem = await rerollDaily(req.params.taskId);
    res.json({ ok: true, problem });
  } catch (err) {
    if (err.message === 'No such daily') return res.status(404).json({ error: err.message });
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/dailys/definitions', (_req, res) => {
  res.json({ definitions: listDefinitions() });
});

app.post('/api/dailys/definitions', (req, res) => {
  const { title, kind, description, enabled, quest, order } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (kind && !['potd', 'random', 'quest', 'custom'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be potd, random, quest or custom' });
  }
  try {
    res.json({ ok: true, definition: addDefinition({ title, kind, description, enabled, quest, order }) });
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

app.put('/api/dailys/definitions/:id', (req, res) => {
  const updated = updateDefinition(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'No such daily' });
  res.json({ ok: true, definition: updated });
});

app.delete('/api/dailys/definitions/:id', (req, res) => {
  res.json({ ok: removeDefinition(req.params.id) });
});

/** Diagnostics: how much of LeetCode's data we're holding and how stale. */
app.get('/api/dailys/cache', (_req, res) => {
  res.json(leetcodeCacheStatus());
});

/* ------------------------- leetcode profile / quests ----------------------- */

/**
 * Live LeetCode profile stats. Returns { configured: false, profile: null }
 * when no username is set, so the UI can prompt instead of erroring.
 */
app.get('/api/leetcode/profile', async (req, res) => {
  const lc = await import('./leetcode.js');
  // ?username=foo lets anyone preview a handle without saving it.
  const u = req.query.username ? String(req.query.username) : lc.getConfiguredUsername();
  if (!u) {
    return res.json({ configured: false, authenticated: lc.hasAuth(), profile: null });
  }
  try {
    const profile = await lc.getProfile(u);
    res.json({
      configured: true,
      authenticated: lc.hasAuth(),
      username: u,
      profile,
      error: profile ? undefined : 'Could not read that profile',
    });
  } catch (err) {
    res.json({ configured: true, authenticated: false, username: u, profile: null, error: String(err?.message ?? err) });
  }
});

/** Save the LeetCode username to track. Not a secret — safe to store. */
app.put('/api/leetcode/username', async (req, res) => {
  const lc = await import('./leetcode.js');
  const raw = String((req.body || {}).username || '').trim();
  if (!raw) return res.status(400).json({ error: 'username is required' });
  const username = lc.setConfiguredUsername(raw);
  res.json({ ok: true, username });
});

app.get('/api/leetcode/username', async (_req, res) => {
  const lc = await import('./leetcode.js');
  res.json({ username: lc.getConfiguredUsername() });
});

app.get('/api/leetcode/quests', async (_req, res) => {
  try {
    const lc = await import('./leetcode.js');
    res.json(await lc.getQuests());
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post('/api/leetcode/quests/progress', async (req, res) => {
  try {
    const { slug, unitId, action = 'increment', levels = 1, maxLevels = 1 } = req.body || {};
    if (!slug || !unitId) {
      return res.status(400).json({ error: 'slug and unitId are required' });
    }
    updateQuestProgress(String(slug), String(unitId), {
      action: String(action),
      levels: Number(levels) || 1,
      maxLevels: Number(maxLevels) || 1,
    });
    const lc = await import('./leetcode.js');
    const { quests } = await lc.getQuests();
    const updatedQuest = quests.find((q) => q.slug === slug) || null;
    res.json({ ok: true, quest: updatedQuest, allQuests: quests });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get('/api/leetcode/quests/suggest', async (_req, res) => {
  try {
    const lc = await import('./leetcode.js');
    const quest = await lc.getSuggestedQuest();
    res.json({ ok: true, quest });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get('/api/leetcode/ratings', (_req, res) => {
  res.json({ ratings: getLeetCodeRatings() });
});

app.post('/api/leetcode/ratings', (req, res) => {
  const { slug, rating, title, difficulty, timeSeconds, outcome, notes } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  const result = rateLeetCodeProblem(String(slug), {
    rating: typeof rating === 'number' ? Math.max(0, Math.min(10, rating)) : undefined,
    title: title ? String(title) : undefined,
    difficulty: difficulty ? String(difficulty) : undefined,
    timeSeconds: typeof timeSeconds === 'number' ? timeSeconds : 0,
    outcome: outcome ? String(outcome) : undefined,
    notes: notes !== undefined ? String(notes) : undefined,
  });
  res.json({ ok: true, rating: result });
});

/* ------------------------------ study plans ----------------------------- */

// List all 11 plans with progress summary (fast — mostly from cache)
app.get('/api/studyplans', async (req, res) => {
  try {
    const plans = await getAllStudyPlansWithProgress();
    res.json({ ok: true, plans });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Single plan with full group/problem detail + progress
app.get('/api/studyplans/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  try {
    const plan = await getStudyPlanWithProgress(slug);
    if (!plan) return res.status(404).json({ error: 'Plan not found or unavailable' });
    res.json({ ok: true, plan });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Mark / unmark a problem as done within a plan
app.post('/api/studyplans/:slug/problems/:problemSlug', (req, res) => {
  const { slug, problemSlug } = req.params;
  const done = req.body?.done !== false; // default true
  try {
    markStudyPlanProblem(slug, problemSlug, done);
    res.json({ ok: true, planSlug: slug, problemSlug, done });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Bulk progress for all plans (lightweight — just completion counts)
app.get('/api/studyplans/progress', (req, res) => {
  res.json({ ok: true, progress: getStudyPlanProgress() });
});

/* ------------------------------ neetcode -------------------------------- */

// Get all 824 free NeetCode problems grouped by pattern with completion state
app.get('/api/neetcode/problems', (req, res) => {
  try {
    const data = getNeetcodePatternsWithProgress();
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Mark / unmark a NeetCode problem as done
app.post('/api/neetcode/problems/:code', (req, res) => {
  const { code } = req.params;
  if (!code) return res.status(400).json({ error: 'problem code required' });
  const done = req.body?.done !== false; // default true
  try {
    const updated = markNeetcodeProblem(code, done);
    res.json({ ok: true, code, done, progress: updated });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Get a random NeetCode free problem
app.get('/api/neetcode/random', (req, res) => {
  try {
    const { difficulty, pattern } = req.query;
    const problem = getRandomNeetcodeProblem({ difficulty, pattern });
    if (!problem) return res.status(404).json({ error: 'No problems found matching criteria' });
    res.json({ ok: true, problem });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/* ---------------------------- project euler ------------------------------ */

// Get all Project Euler problems with user completion status and difficulty stats
app.get('/api/euler/problems', (_req, res) => {
  try {
    const data = getEulerProblemsWithProgress();
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Mark / unmark a Project Euler problem as done
app.post('/api/euler/problems/:id', (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'problem id required' });
  const done = req.body?.done !== false; // default true
  try {
    const updated = markEulerProblem(id, done);
    res.json({ ok: true, id: Number(id), done, progress: updated });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Get cache status of Project Euler problems
app.get('/api/euler/cache', (_req, res) => {
  try {
    res.json(getEulerCacheStatus());
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Sync latest problems and solver counts from Project Euler (same as LeetCode cache refresh)
app.post('/api/euler/sync', async (_req, res) => {
  try {
    const result = await syncEulerProblems();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Get problem description HTML on demand
app.get('/api/euler/problems/:id/content', async (req, res) => {
  const { id } = req.params;
  try {
    const content = await getEulerProblemContent(id);
    res.json({ ok: true, id: Number(id), content });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/* ------------------------------ system info ----------------------------- */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    habiticaConfigured: isHabiticaConfigured(),
    calendarConfigured: isCalendarConfigured(),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

app.get('/api/app/info', (_req, res) => {
  res.json({
    name: 'Roadmap & Habitica Offline Desktop',
    version: '1.0.0',
    port: process.env.PORT || 4177,
    mode: 'desktop',
    syncIntervals: {
      habiticaMinutes: 3,
      googleCalendarMinutes: 15,
    },
  });
});

/* ------------------------------ static app ------------------------------ */
// Serve the built React app if present (app/dist) + data files (update report)
const DIST = path.join(__dirname, '..', '..', 'app', 'dist');
const DATA_DIR_STATIC = path.join(__dirname, '..', '..', 'data');
app.use('/data', express.static(DATA_DIR_STATIC));
app.use(express.static(DIST));
// SPA fallback for client-side routing
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

const PORT = process.env.PORT || 4177;
app.listen(PORT, () => {
  console.log(`Skill Trail server → http://localhost:${PORT}`);
  // Warm the topic-content index/cache once the server is accepting requests, so
  // the first full-text search doesn't pay the one-off directory walk. Runs on
  // the next tick rather than at import time to keep startup instant.
  setImmediate(() => {
    try {
      const cached = warmContentCache();
      console.log(`[server] content cache warm (${cached} topic files)`);
    } catch (err) {
      console.warn('[server] Content cache warm-up skipped:', err.message);
    }
  });

  // Auto-sync Project Euler problems if cache is older than 24 hours
  setImmediate(async () => {
    try {
      const status = getEulerCacheStatus();
      if (status.cacheAgeHours == null || status.cacheAgeHours >= 24) {
        console.log('[server] Project Euler cache is older than 24h, syncing in background...');
        await syncEulerProblems();
        console.log('[server] Project Euler sync complete.');
      }
    } catch (err) {
      console.warn('[server] Project Euler background sync skipped:', err.message);
    }
  });

  /* ------------------- background 2-way sync workers ------------------- */
  const HABITICA_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
  const GCALENDAR_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // Habitica incoming sync: checks if any daily was completed/unchecked on Habitica (e.g. via mobile app)
  async function runHabiticaPoll() {
    try {
      if (!isHabiticaConfigured()) return;
      const res = await syncHabiticaToRoadmap(recordAttempt, clearToday, getCompletion);
      if (res.changes && res.changes.length > 0) {
        console.log(`[background-sync] Habitica synced ${res.changes.length} change(s)`);
      }
    } catch (err) {
      console.warn('[background-sync] Habitica poll skipped:', err.message);
    }
  }

  // Google Calendar slot sync: scans today's free slots and ensures dailies have reserved blocks
  async function runGCalendarPoll() {
    try {
      if (!isCalendarConfigured()) return;
      const res = await syncFreeSlotsSchedule();
      if (res.scheduled && res.scheduled.length > 0) {
        console.log(`[background-sync] Google Calendar scheduled ${res.scheduled.length} task(s)`);
      }
    } catch (err) {
      console.warn('[background-sync] Google Calendar poll skipped:', err.message);
    }
  }

  // Initial runs shortly after startup
  setTimeout(runHabiticaPoll, 10000);
  setTimeout(runGCalendarPoll, 15000);

  // Recurring background timers
  setInterval(runHabiticaPoll, HABITICA_INTERVAL_MS);
  setInterval(runGCalendarPoll, GCALENDAR_INTERVAL_MS);
});
