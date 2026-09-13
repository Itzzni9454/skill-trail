/**
 * LeetCode data layer.
 *
 * LeetCode has no official public API, so this uses the two endpoints the site
 * itself uses. Both are undocumented and can change; everything here is written
 * to degrade rather than throw:
 *
 *   - **Cache-first**, with per-type TTLs. The problem set is ~3k entries and
 *     rarely changes, so it is cached for a day; a question's detail for a week.
 *   - **Retry with backoff** (3 attempts) on network failure or 5xx.
 *   - **Fallbacks**: if today's challenge can't be fetched, the caller gets a
 *     random problem instead, so a daily is always available offline or when
 *     LeetCode is unreachable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllNeetcodeProblems } from './neetcode.js';
// Use the SAME data dir as store.js — deriving it from cwd put these files in
// server/data while everything else lived in the repo-root data/.
import { DATA_DIR, getQuestProgress } from './store.js';
import { pickRandomStudyPlanProblem } from './studyplans.js';

const CACHE_FILE = path.join(DATA_DIR, 'cache', 'leetcode.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TTL = {
  daily: 6 * 3600_000,
  problemset: 24 * 3600_000,
  question: 7 * 24 * 3600_000,
};

/* ----------------------------- credentials -------------------------------- */
/*
 * Credentials come from the environment only — populated from a gitignored
 * `.env` (see .env.example). They are NEVER written to a data file, NEVER
 * returned by any /api route, and NEVER logged.
 *
 * Required for profile data (solved counts, ranking, contest rating):
 *   LEETCODE_USERNAME    your profile slug, e.g. "neetcode"   (not secret)
 *   LEETCODE_SESSION     the LEETCODE_SESSION cookie value    (SECRET)
 *   LEETCODE_CSRF        the csrftoken cookie value           (SECRET)
 *
 * Treat LEETCODE_SESSION like a password: it is a full session token for your
 * account. Anyone holding it can act as you on LeetCode.
 */

export function credentials() {
  return {
    session: process.env.LEETCODE_SESSION || '',
    csrf: process.env.LEETCODE_CSRF || process.env.LEETCODE_CSRFTOKEN || '',
    username: process.env.LEETCODE_USERNAME || '',
  };
}

export const hasAuth = () => !!credentials().session;

/** Cookie + CSRF + Referer + UA, matching what the site itself sends. */
function authHeaders(extra = {}) {
  const { session, csrf } = credentials();
  const h = { 'User-Agent': UA, Referer: 'https://leetcode.com', ...extra };
  const cookie = [
    session && `LEETCODE_SESSION=${session}`,
    csrf && `csrftoken=${csrf}`,
  ]
    .filter(Boolean)
    .join('; ');
  if (cookie) h.Cookie = cookie;
  if (csrf) h['x-csrftoken'] = csrf;
  return h;
}

/* ------------------------------- cache ----------------------------------- */

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(c) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

function cacheGet(key, ttl) {
  const c = readCache();
  const hit = c[key];
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) return null;
  return hit.data;
}

function cacheSet(key, data) {
  const c = readCache();
  c[key] = { at: Date.now(), data };
  writeCache(c);
}

/* ------------------------------- fetch ----------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with retries and exponential backoff. Returns null if all attempts fail. */
async function resilientFetch(url, init, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      // 4xx other than 429 won't improve on retry.
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
    if (i < attempts - 1) await sleep(400 * 3 ** i);
  }
  console.warn(`[leetcode] request failed: ${lastErr?.message ?? 'unknown'}`);
  return null;
}

/* ------------------------------ problemset -------------------------------- */

const DIFFICULTY = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

/**
 * Full free problem list with acceptance rate and difficulty.
 * Source: the REST endpoint the old site used; still widely available.
 */
export async function getProblemSet() {
  const key = 'problemset';
  const cached = cacheGet(key, TTL.problemset);
  if (cached) return cached;

  const res = await resilientFetch('https://leetcode.com/api/problems/all/', {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res) {
    // Fall back to a stale cache entry rather than returning nothing at all.
    const stale = readCache()[key];
    return stale ? stale.data : [];
  }
  const json = await res.json();
  // NOTE: the counts live on `stat`, not on the pair itself — reading them from
  // the top level silently yields null for every problem.
  const list = (json?.stat_status_pairs || [])
    .filter((p) => !p.paid_only && p.stat?.question__title_slug)
    .map((p) => {
      const acs = p.stat.total_acs ?? null;
      const subs = p.stat.total_submitted ?? null;
      return {
        slug: p.stat.question__title_slug,
        title: p.stat.question__title,
        frontendId: p.stat.frontend_question_id ?? null,
        difficulty: DIFFICULTY[p.difficulty?.level] || 'Medium',
        acceptanceRate: subs ? Math.round((acs / subs) * 1000) / 10 : null,
        totalAcs: acs,
        totalSubmitted: subs,
      };
    });

  if (list.length) cacheSet(key, list);
  return list;
}

/* --------------------------- today's challenge ---------------------------- */

const DAILY_QUERY = `query {
  activeDailyCodingChallengeQuestion {
    date
    question {
      questionId
      questionFrontendId
      title
      titleSlug
      difficulty
      isPaidOnly
    }
  }
}`;

/** Today's daily challenge, or null when unreachable. */
export async function getDailyChallenge() {
  const res = await resilientFetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query: DAILY_QUERY }),
  });
  if (!res) return null;
  try {
    const json = await res.json();
    const q = json?.data?.activeDailyCodingChallengeQuestion;
    if (!q?.question?.titleSlug) return null;
    return {
      date: q.date,
      slug: q.question.titleSlug,
      title: q.question.title,
      frontendId: q.question.questionFrontendId ?? null,
      difficulty: q.question.difficulty ?? null,
      isPaidOnly: !!q.question.isPaidOnly,
      source: 'daily-challenge',
    };
  } catch {
    return null;
  }
}

/* --------------------------- question detail ------------------------------ */

const QUESTION_QUERY = `query q($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    titleSlug
    difficulty
    isPaidOnly
    likes
    dislikes
    stats
    topicTags { name slug }
    similarQuestions
  }
}`;

/**
 * Rich metadata for one problem: likes/dislikes, submission counts, topic tags.
 * Merged with whatever the problemset already knew (acceptance rate, difficulty).
 */
export async function getQuestionDetail(slug) {
  if (!slug) return null;
  const key = `question:${slug}`;
  const cached = cacheGet(key, TTL.question);
  if (cached) return cached;

  const res = await resilientFetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query: QUESTION_QUERY, variables: { titleSlug: slug } }),
  });

  let detail = null;
  if (res) {
    try {
      const json = await res.json();
      const q = json?.data?.question;
      if (q?.titleSlug) {
        let stats = {};
        try {
          stats = JSON.parse(q.stats || '{}');
        } catch {
          stats = {};
        }
        detail = {
          slug: q.titleSlug,
          title: q.title,
          frontendId: q.questionFrontendId ?? null,
          difficulty: q.difficulty ?? null,
          likes: q.likes ?? null,
          dislikes: q.dislikes ?? null,
          totalAccepted: stats.totalAccepted ?? null,
          totalSubmission: stats.totalSubmission ?? null,
          acRate: stats.acRate ?? null,
          topicTags: (q.topicTags || []).map((t) => t.name),
          similarCount: (() => {
            try {
              return (JSON.parse(q.similarQuestions || '[]') || []).length;
            } catch {
              return 0;
            }
          })(),
        };
      }
    } catch {
      detail = null;
    }
  }

  if (detail) cacheSet(key, detail);
  return detail;
}

/* ------------------------------ selection --------------------------------- */

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Resolve a daily task into a concrete problem with as much analytics as we can
 * get. Never throws — a failure degrades to a less-enriched problem, and if even
 * the problem set is unavailable, to a stub the UI can still render.
 *
 * @param {'potd'|'random'|'quest'} kind
 * @param {{difficulty?: string, tags?: string[]}} [quest]
 */
export async function resolveProblem(kind = 'random', quest = {}) {
  // Study plan: delegate entirely to the study plans module
  if (kind === 'studyplan') {
    const picked = await pickRandomStudyPlanProblem(quest).catch(() => null);
    if (picked) return { ...picked, notes: [] };
    return {
      slug: null, title: 'Study Plan unavailable', difficulty: null,
      source: 'unavailable', notes: ['Could not load study plans. Check your connection.'],
    };
  }

  const set = await getProblemSet();
  const notes = [];

  let base = null;
  if (kind === 'potd') {
    const daily = await getDailyChallenge();
    if (daily) {
      const fromSet = set.find((p) => p.slug === daily.slug);
      base = {
        slug: daily.slug,
        title: daily.title || fromSet?.title || daily.slug,
        frontendId: daily.frontendId ?? fromSet?.frontendId ?? null,
        difficulty: daily.difficulty || fromSet?.difficulty || null,
        acceptanceRate: fromSet?.acceptanceRate ?? null,
        totalAcs: fromSet?.totalAcs ?? null,
        totalSubmitted: fromSet?.totalSubmitted ?? null,
        source: 'daily-challenge',
        challengeDate: daily.date ?? null,
      };
    } else {
      notes.push("Couldn't reach today's challenge — showing a random problem instead.");
    }
  }

  if (!base && kind === 'quest') {
    // A Quest is interactive on LeetCode's own site: levels, XP and your
    // position all live there. We enrich it with the user's local progress,
    // identifying their current active unit and next level.
    const { quests, source: questSource } = await getQuests();
    // Prefer incomplete quests first, otherwise pick any
    const incomplete = quests.filter((q) => !q.isCompleted);
    const pool = incomplete.length > 0 ? incomplete : quests;
    const picked = pickRandom(pool) || null;
    if (picked) {
      const active = picked.activeUnit || picked.units[0];
      base = {
        slug: null,
        title: active ? `${picked.name}: ${active.name}` : picked.name,
        difficulty: quest.difficulty || 'Medium',
        frontendId: null,
        isQuest: true,
        questSlug: picked.slug,
        questUrl: `https://leetcode.com/quest/${picked.slug}/`,
        units: picked.units,
        totalLevels: picked.totalLevels,
        completedLevels: picked.completedLevels,
        activeUnit: active,
        nextLevel: picked.nextLevel,
        progress: {
          hasCompleted: picked.isCompleted,
          completedUnitNum: picked.completedUnits,
          completedLevelNum: picked.completedLevels,
        },
        source: 'quest',
      };
      base.quest = {
        category: picked.category,
        slug: picked.slug,
        title: picked.name,
        units: picked.units,
        totalLevels: picked.totalLevels,
        completedLevels: picked.completedLevels,
        activeUnit: active,
        nextLevel: picked.nextLevel,
        progress: base.progress,
        source: questSource,
      };
      if (questSource === 'fallback') {
        notes.push('Using the built-in quest list — live plan lookup unavailable.');
      }
    }
  }

  if (!base) {
    base = pickRandom(set) || null;
    if (base) base.source = kind === 'potd' ? 'random-fallback' : 'random';
    if (kind === 'potd') notes.push('Fell back to a random problem.');
  }

  if (!base) {
    // Nothing at all — offline and cache cold. Still return something renderable.
    return {
      slug: null,
      title: 'Problem unavailable',
      difficulty: 'Medium',
      acceptanceRate: null,
      source: 'unavailable',
      notes: [
        ...notes,
        "Couldn't load the problem list. Check your connection — dailies still track completion.",
      ],
    };
  }

  // Enrich with detail when possible; omission is fine, the UI handles gaps.
  const detail = await getQuestionDetail(base.slug).catch(() => null);

  const cleanSlug = (base.slug || '').toLowerCase().trim();
  const cleanTitle = (base.title || '').toLowerCase().trim();
  const ncProblems = getAllNeetcodeProblems();
  const ncMatch = ncProblems.find((p) => {
    const itemSlug = (p.link || '').replace(/\/$/, '').toLowerCase();
    const itemCodeSlug = (p.code || '').replace(/^\d+-/, '').toLowerCase();
    const itemName = (p.name || '').toLowerCase();
    return (cleanSlug && (itemSlug === cleanSlug || itemCodeSlug === cleanSlug)) || (cleanTitle && itemName === cleanTitle);
  });

  const videoUrl = ncMatch?.video
    ? `https://www.youtube.com/watch?v=${ncMatch.video}`
    : (base.title || base.slug)
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent('LeetCode ' + (base.frontendId ? base.frontendId + ' ' : '') + (base.title || base.slug) + ' solution')}`
    : null;

  const normalizedDiff = (base.difficulty === 'Easy' || base.difficulty === 'Hard') ? base.difficulty : 'Medium';

  return {
    ...base,
    difficulty: normalizedDiff,
    likes: detail?.likes ?? null,
    dislikes: detail?.dislikes ?? null,
    totalAccepted: detail?.totalAccepted ?? null,
    totalSubmission: detail?.totalSubmission ?? null,
    acRate: detail?.acRate ?? null,
    topicTags: detail?.topicTags ?? [],
    video: videoUrl,
    neetcodeUrl: ncMatch?.nc_link ? `https://neetcode.io/problems/${ncMatch.nc_link}` : null,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}

/* --------------------------------- quests --------------------------------- */

/**
 * 1-on-1 static snapshot of the 4 official LeetCode Quests and their 25 units.
 * Acts as guaranteed offline fallback if LeetCode GraphQL is ever unreachable.
 */
export const STATIC_QUESTS = [
  {
    id: '1',
    slug: 'data-structures-and-algorithms-quest',
    name: 'Data Structures and Algorithms',
    category: 'Data Structures and Algorithms',
    icon: 'https://assets.leetcode.com/quest/data-structures-and-algorithms-quest',
    units: [
      { id: '1', name: 'Linear Shoal', icon: 'https://assets.leetcode.com/quest/unit_759a_01_F8615C.png', total: 4 },
      { id: '2', name: 'Sequence Valley', icon: 'https://assets.leetcode.com/quest/unit_981b_02_F969A7.png', total: 4 },
      { id: '3', name: 'Association Slope', icon: 'https://assets.leetcode.com/quest/unit_5708_03_C477E5.png', total: 3 },
      { id: '4', name: 'Sorting Plateau', icon: 'https://assets.leetcode.com/quest/unit_fb4e_04_1A90FF.png', total: 4 },
      { id: '5', name: 'Recursion Maze', icon: 'https://assets.leetcode.com/quest/unit_1221_05_46C6C2.png', total: 5 },
      { id: '6', name: 'Graph Theory Peaks', icon: 'https://assets.leetcode.com/quest/unit_6326_06_28C244.png', total: 5 },
      { id: '7', name: 'Tree-shaped Deep Forest', icon: 'https://assets.leetcode.com/quest/unit_719c_07_FAC31D.png', total: 5 },
      { id: '8', name: 'Strategy Summit', icon: 'https://assets.leetcode.com/quest/unit_bce2_09_F8615C.png', total: 5 },
    ],
  },
  {
    id: '2',
    slug: 'database-quest',
    name: 'Database',
    category: 'Database',
    icon: 'https://assets.leetcode.com/quest/database-quest',
    units: [
      { id: '9', name: 'SQL Basic Query Workstation', icon: 'https://assets.leetcode.com/quest/unit_9e2a_01_F8615C.png', total: 1 },
      { id: '10', name: 'Filtering & Aggregation Operation Cabin', icon: 'https://assets.leetcode.com/quest/unit_6797_02_F969A7.png', total: 1 },
      { id: '11', name: 'Grouping & Join Aggregation Library', icon: 'https://assets.leetcode.com/quest/unit_cece_03_C477E5.png', total: 1 },
      { id: '12', name: 'Window Functions & Ranking Analysis Room', icon: 'https://assets.leetcode.com/quest/unit_5c10_04_1A90FF.png', total: 1 },
      { id: '13', name: 'SQL Advanced Operation Center', icon: 'https://assets.leetcode.com/quest/unit_7c38_05_46C6C2.png', total: 1 },
    ],
  },
  {
    id: '3',
    slug: 'system-and-software-design-quest',
    name: 'System & Software Design',
    category: 'System & Software Design',
    icon: 'https://assets.leetcode.com/quest/system-and-software-design-quest',
    units: [
      { id: '14', name: 'Cache System Design Base', icon: 'https://assets.leetcode.com/quest/unit_4010_01_F8615C.png', total: 1 },
      { id: '15', name: 'Data Flow Processing Center', icon: 'https://assets.leetcode.com/quest/unit_abcc_02_F969A7.png', total: 1 },
      { id: '16', name: 'Data Structure Design Workshop', icon: 'https://assets.leetcode.com/quest/unit_9cb0_03_C477E5.png', total: 1 },
      { id: '17', name: 'Business System Simulation Platform', icon: 'https://assets.leetcode.com/quest/unit_b53d_04_1A90FF.png', total: 1 },
      { id: '18', name: 'Comprehensive Data Operation Simulation Station', icon: 'https://assets.leetcode.com/quest/unit_1ab5_05_46C6C2.png', total: 1 },
    ],
  },
  {
    id: '4',
    slug: 'maths-quest',
    name: 'Maths',
    category: 'Maths',
    icon: 'https://assets.leetcode.com/quest/maths-quest',
    units: [
      { id: '19', name: 'Arithmetic Reasoning Terminal Station', icon: 'https://assets.leetcode.com/quest/unit_6687_01_F8615C.png', total: 1 },
      { id: '20', name: 'Divisibility and Modular Arithmetic Data Cabin', icon: 'https://assets.leetcode.com/quest/unit_fefc_02_F969A7.png', total: 1 },
      { id: '21', name: 'Combination and Permutation Module Library', icon: 'https://assets.leetcode.com/quest/unit_0507_03_C477E5.png', total: 1 },
      { id: '22', name: 'Number Theory Factor Encryption Station', icon: 'https://assets.leetcode.com/quest/unit_9a08_04_1A90FF.png', total: 1 },
      { id: '23', name: 'Geometric Configuration Mecha Workshop', icon: 'https://assets.leetcode.com/quest/unit_5019_05_46C6C2.png', total: 1 },
      { id: '24', name: 'Bit Operation Chip Laboratory', icon: 'https://assets.leetcode.com/quest/unit_d119_06_28C244.png', total: 1 },
      { id: '25', name: 'Bitmask State Control Center', icon: 'https://assets.leetcode.com/quest/unit_f348_07_FAC31D.png', total: 1 },
    ],
  },
];

const QUEST_SLUGS = STATIC_QUESTS.map((q) => q.slug);

const QUESTS_QUERY = `query getQuest($slug: String!) {
  questDetail(questSlug: $slug) {
    id
    name
    slug
    icon
    progress { completedUnitNum completedLevelNum hasCompleted }
  }
  questUnits(questSlug: $slug) { id name icon completedLevelNum totalLevelNum }
}`;

/** Fetch one quest's public content plus whatever progress we're allowed to see. */
async function fetchQuest(slug) {
  const fallback = STATIC_QUESTS.find((q) => q.slug === slug);
  const res = await resilientFetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query: QUESTS_QUERY, variables: { slug } }),
  });
  if (!res) return null;
  try {
    const j = await res.json();
    const d = j?.data?.questDetail;
    if (!d?.slug) return null;
    const units = j?.data?.questUnits || fallback?.units || [];
    return {
      id: d.id || fallback?.id,
      slug: d.slug,
      name: d.name || fallback?.name || d.slug,
      category: d.name || fallback?.category || d.slug,
      icon: d.icon || fallback?.icon || null,
      units: units.map((u, i) => {
        const fbUnit = fallback?.units?.[i];
        return {
          id: String(u.id || fbUnit?.id || i + 1),
          name: u.name || fbUnit?.name || `Unit ${i + 1}`,
          icon: u.icon || fbUnit?.icon || null,
          total: u.totalLevelNum ?? fbUnit?.total ?? 1,
          completed: u.completedLevelNum ?? 0,
        };
      }),
      remoteProgress: d.progress || null,
    };
  } catch {
    return null;
  }
}

/**
 * Merge quest structure with local user progress from state.json.
 */
function enrichQuestWithProgress(quest, userProg) {
  const savedUnits = userProg?.units || {};
  let totalDone = 0;
  let allTotal = 0;
  let activeFound = false;

  const units = (quest.units || []).map((u, index) => {
    const total = Number(u.total ?? u.totalLevelNum ?? 1) || 1;
    allTotal += total;

    // Local progress stored by unit id or name
    const localVal = savedUnits[u.id] ?? savedUnits[u.name];
    const remoteVal = u.completed > 0 ? u.completed : 0;
    const completed = Math.max(0, Math.min(Number(localVal ?? remoteVal ?? 0), total));
    totalDone += completed;

    let status = 'locked';
    if (completed >= total) {
      status = 'completed';
    } else if (!activeFound) {
      status = 'active';
      activeFound = true;
    }

    return {
      id: String(u.id || index + 1),
      name: u.name,
      icon: u.icon || null,
      total,
      completed,
      status,
      currentLevel: completed < total ? completed + 1 : total,
    };
  });

  const activeUnit = units.find((u) => u.status === 'active') || units[units.length - 1] || null;
  const isCompleted = allTotal > 0 && totalDone >= allTotal;

  return {
    ...quest,
    icon: quest.icon || `https://assets.leetcode.com/quest/${quest.slug}`,
    units,
    totalLevels: allTotal,
    completedLevels: totalDone,
    completedUnits: units.filter((u) => u.completed >= u.total).length,
    totalUnits: units.length,
    percent: allTotal > 0 ? Math.round((totalDone / allTotal) * 100) : 0,
    isCompleted,
    activeUnit: isCompleted ? null : activeUnit,
    nextLevel: isCompleted
      ? 'All Levels Completed'
      : activeUnit
      ? `${activeUnit.name} · Level ${activeUnit.currentLevel}/${activeUnit.total}`
      : null,
  };
}

/**
 * Every quest with full content and local progress.
 * Caches base metadata for 24h, but always applies latest local progress dynamically.
 */
export async function getQuests() {
  const key = 'quests_blueprint';
  let cached = cacheGet(key, TTL.problemset);
  if (!cached) {
    const results = await Promise.all(QUEST_SLUGS.map((s2) => fetchQuest(s2).catch(() => null)));
    const live = results.filter(Boolean);
    cached = live.length
      ? { quests: live, source: 'live' }
      : { quests: JSON.parse(JSON.stringify(STATIC_QUESTS)), source: 'fallback' };
    cacheSet(key, cached);
  }

  const allProgress = getQuestProgress() || {};
  const quests = cached.quests.map((q) => enrichQuestWithProgress(q, allProgress[q.slug]));

  return {
    quests,
    source: cached.source,
  };
}

/**
 * Suggest a random incomplete quest (or least progressed).
 */
export async function getSuggestedQuest() {
  const { quests } = await getQuests();
  const incomplete = quests.filter((q) => !q.isCompleted);
  const pool = incomplete.length > 0 ? incomplete : quests;
  return pickRandom(pool) || quests[0] || null;
}

/* -------------------------------- profile -------------------------------- */

const PROFILE_QUERY = `query getUserProfile($username: String!) {
  matchedUser(username: $username) {
    username
    submitStatsGlobal {
      acSubmissionNum { difficulty count }
      totalSubmissionNum { difficulty count }
    }
    profile {
      ranking
      reputation
      realName
      userAvatar
      aboutMe
      countryName
      school
    }
    userCalendar { streak totalActiveDays submissionCalendar }
    languageProblemCount { languageName problemsSolved }
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
  }
  userContestRanking(username: $username) {
    rating
    globalRanking
    totalParticipants
    attendedContestsCount
    topPercentage
  }
  recentAcSubmissionList(username: $username, limit: 10) {
    title
    titleSlug
    timestamp
  }
}`;

/* -------------------- configurable username (never hardcode) -------------------- */

const USERNAME_FILE = path.join(DATA_DIR, 'leetcode.json');

/** Username set by the user in the UI, falling back to env for self-hosters. */
export function getConfiguredUsername() {
  try {
    const j = JSON.parse(fs.readFileSync(USERNAME_FILE, 'utf8'));
    if (j?.username) return String(j.username);
  } catch {
    /* no file yet */
  }
  return process.env.LEETCODE_USERNAME || '';
}

export function setConfiguredUsername(username) {
  const clean = String(username || '').trim().replace(/^@/, '');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERNAME_FILE, JSON.stringify({ username: clean }, null, 2));
  return clean;
}

export async function getProfile(usernameOverride) {
  const u = (usernameOverride || getConfiguredUsername() || '').trim().replace(/^@/, '');
  if (!u) return null;

  const key = `profile:${u}`;
  const cached = cacheGet(key, 30 * 60_000);
  if (cached) return cached;

  const res = await resilientFetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query: PROFILE_QUERY, variables: { username: u } }),
  });
  if (!res) {
    const stale = readCache()[key];
    return stale ? stale.data : null;
  }

  try {
    const j = await res.json();
    const mu = j?.data?.matchedUser;
    if (!mu) return null;

    const ac = {};
    const tot = {};
    for (const x of mu.submitStatsGlobal?.acSubmissionNum || []) ac[x.difficulty] = x.count;
    for (const x of mu.submitStatsGlobal?.totalSubmissionNum || []) tot[x.difficulty] = x.count;

    const solved = {
      All: ac.All ?? null,
      Easy: ac.Easy ?? null,
      Medium: ac.Medium ?? null,
      Hard: ac.Hard ?? null,
    };
    // Overall acceptance: accepted / attempted, across every difficulty.
    const attempts = tot.All ?? null;
    const acceptanceRate =
      attempts && solved.All != null ? Math.round((solved.All / attempts) * 1000) / 10 : null;

    // Heatmap: submissionCalendar is a JSON object of unix-day -> count.
    let calendar = {};
    try {
      calendar = JSON.parse(mu.userCalendar?.submissionCalendar || '{}');
    } catch {
      calendar = {};
    }
    const cal = Object.entries(calendar)
      .map(([ts, c]) => ({ date: new Date(Number(ts) * 1000).toISOString().slice(0, 10), count: c }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const contest = j?.data?.userContestRanking || null;
    const tags = [
      ...(mu.tagProblemCounts?.advanced || []),
      ...(mu.tagProblemCounts?.intermediate || []),
      ...(mu.tagProblemCounts?.fundamental || []),
    ]
      .filter((t) => t?.tagName && t.problemsSolved > 0)
      .sort((a, b) => b.problemsSolved - a.problemsSolved);

    const out = {
      username: mu.username ?? u,
      realName: mu.profile?.realName || null,
      avatar: mu.profile?.userAvatar || null,
      country: mu.profile?.countryName || null,
      solved,
      attempts,
      acceptanceRate,
      ranking: mu.profile?.ranking ?? null,
      reputation: mu.profile?.reputation ?? null,
      streak: mu.userCalendar?.streak ?? null,
      totalActiveDays: mu.userCalendar?.totalActiveDays ?? null,
      calendar: cal,
      languages: (mu.languageProblemCount || [])
        .filter((l) => l?.languageName && l.problemsSolved > 0)
        .sort((a, b) => b.problemsSolved - a.problemsSolved),
      tags: tags.slice(0, 12),
      contest: contest
        ? {
            rating: contest.rating ? Math.round(contest.rating) : null,
            globalRanking: contest.globalRanking ?? null,
            totalParticipants: contest.totalParticipants ?? null,
            attended: contest.attendedContestsCount ?? null,
            topPercentage: contest.topPercentage ?? null,
          }
        : null,
      recent: (j?.data?.recentAcSubmissionList || []).map((r) => ({
        title: r.title,
        slug: r.titleSlug,
        at: new Date(Number(r.timestamp) * 1000).toISOString(),
      })),
      fetchedAt: new Date().toISOString(),
    };
    cacheSet(key, out);
    return out;
  } catch {
    return null;
  }
}

/** How many entries are cached and how fresh — surfaced in the UI. */
export function cacheStatus() {
  const c = readCache();
  const keys = Object.keys(c);
  return {
    entries: keys.length,
    problemsetAgeHours: c.problemset
      ? Math.round((Date.now() - c.problemset.at) / 3600_000)
      : null,
    problemCount: Array.isArray(c.problemset?.data) ? c.problemset.data.length : 0,
  };
}
