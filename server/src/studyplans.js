/**
 * LeetCode Study Plans data layer.
 *
 * Fetches plan content from the public LeetCode GraphQL API, caches per plan
 * for 7 days, and merges with locally tracked completion data from state.json.
 *
 * Plans included: 11 free plans (Amazon/Google High-Frequency excluded —
 * they're behind a login wall and return only 2 problems).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getStudyPlanProgress } from './store.js';

/* ----------------------------- plan metadata ------------------------------ */

export const STUDY_PLANS = [
  { slug: 'leetcode-75',          name: 'LeetCode 75',           icon: '🏆', highlight: 'Ace Coding Interview with 75 Qs' },
  { slug: 'top-interview-150',    name: 'Top Interview 150',     icon: '🎯', highlight: 'Must-Do List for Interview Prep' },
  { slug: 'top-100-liked',        name: 'Top 100 Liked',         icon: '⭐', highlight: 'Top 100 Liked Questions' },
  { slug: 'top-sql-50',           name: 'Top SQL 50',            icon: '🗄️', highlight: 'Boost your SQL knowledge' },
  { slug: '30-days-of-javascript',name: '30 Days of JavaScript', icon: '⚡', highlight: 'Learn JavaScript in 30 Days' },
  { slug: 'dynamic-programming',  name: 'Dynamic Programming',   icon: '🔢', highlight: 'Master Dynamic Programming' },
  { slug: 'programming-skills',   name: 'Programming Skills',    icon: '💻', highlight: 'Boost your coding skills' },
  { slug: 'graph-theory',         name: 'Graph Theory',          icon: '🕸️', highlight: 'Learn Graph Algorithms' },
  { slug: 'binary-search',        name: 'Binary Search',         icon: '🔍', highlight: 'Master Binary Search' },
  { slug: 'introduction-to-pandas', name: 'Introduction to Pandas', icon: '🐼', highlight: 'Learn Pandas in 15 Qs' },
  { slug: '30-days-of-pandas',    name: '30 Days of Pandas',     icon: '📊', highlight: '30-Day Pandas Challenge' },
];

/* ----------------------------- cache -------------------------------------- */

const CACHE_FILE = path.join(DATA_DIR, 'cache', 'studyplans.json');
const TTL_MS = 7 * 24 * 3600_000; // 7 days

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}

function writeCache(c) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}

function cacheGet(slug) {
  const c = readCache();
  const hit = c[slug];
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) return null;
  return hit.data;
}

function cacheSet(slug, data) {
  const c = readCache();
  c[slug] = { at: Date.now(), data };
  writeCache(c);
}

/* ----------------------------- fetch -------------------------------------- */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const STUDY_PLAN_QUERY = `
query studyPlanV2Detail($planSlug: String!) {
  studyPlanV2Detail(planSlug: $planSlug) {
    slug
    name
    highlight
    planSubGroups {
      slug
      name
      questions {
        titleSlug
        title
        difficulty
        paidOnly
      }
    }
  }
}`;

/**
 * Fetch a single study plan from LeetCode GraphQL.
 * Returns null on failure. Filters out paidOnly problems.
 */
async function fetchStudyPlanFromAPI(slug) {
  try {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Referer: 'https://leetcode.com',
      },
      body: JSON.stringify({ query: STUDY_PLAN_QUERY, variables: { planSlug: slug } }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const plan = json?.data?.studyPlanV2Detail;
    if (!plan) return null;

    // Normalise difficulty to Title Case and filter paid-only problems
    const groups = (plan.planSubGroups || []).map((g) => ({
      slug: g.slug,
      name: g.name,
      problems: (g.questions || [])
        .filter((q) => !q.paidOnly)
        .map((q) => ({
          slug: q.titleSlug,
          title: q.title,
          difficulty: (q.difficulty && (q.difficulty.toUpperCase() === 'EASY' || q.difficulty.toUpperCase() === 'HARD'))
            ? q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1).toLowerCase()
            : 'Medium',
        })),
    })).filter((g) => g.problems.length > 0);

    const meta = STUDY_PLANS.find((p) => p.slug === slug);
    return {
      slug: plan.slug,
      name: meta?.name || plan.name,
      highlight: meta?.highlight || plan.highlight || '',
      icon: meta?.icon || '📚',
      groups,
      totalProblems: groups.reduce((s, g) => s + g.problems.length, 0),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn(`[studyplans] fetch failed for ${slug}: ${e?.message}`);
    return null;
  }
}

/**
 * Get one plan, cache-first. Returns null if unreachable and no cache.
 */
export async function getStudyPlan(slug) {
  const cached = cacheGet(slug);
  if (cached) return cached;

  const fresh = await fetchStudyPlanFromAPI(slug);
  if (fresh) {
    cacheSet(slug, fresh);
    return fresh;
  }

  // Return stale cache rather than nothing
  const stale = readCache()[slug];
  return stale ? stale.data : null;
}

/**
 * Merge plan data with user progress.
 */
function mergeProgress(plan, allProgress) {
  if (!plan) return null;
  const progress = allProgress[plan.slug] || { completedProblems: [] };
  const completed = new Set(progress.completedProblems || []);
  const completedCount = plan.groups.reduce(
    (s, g) => s + g.problems.filter((p) => completed.has(p.slug)).length, 0
  );
  return {
    ...plan,
    completedProblems: [...completed],
    completedCount,
    isCompleted: completedCount >= plan.totalProblems && plan.totalProblems > 0,
    groups: plan.groups.map((g) => ({
      ...g,
      problems: g.problems.map((p) => ({ ...p, done: completed.has(p.slug) })),
      completedCount: g.problems.filter((p) => completed.has(p.slug)).length,
    })),
  };
}

/**
 * All plans with progress, fetched in parallel.
 * Plans that can't be fetched get a minimal stub.
 */
export async function getAllStudyPlansWithProgress() {
  const allProgress = getStudyPlanProgress();
  const plans = await Promise.all(
    STUDY_PLANS.map(async (meta) => {
      const plan = await getStudyPlan(meta.slug);
      if (!plan) {
        // Stub for unreachable plan
        return {
          slug: meta.slug, name: meta.name, icon: meta.icon,
          highlight: meta.highlight, groups: [], totalProblems: 0,
          completedCount: 0, isCompleted: false, completedProblems: [],
          error: 'Could not fetch plan content',
        };
      }
      return mergeProgress(plan, allProgress);
    })
  );
  return plans;
}

/**
 * Single plan detail with progress.
 */
export async function getStudyPlanWithProgress(slug) {
  const plan = await getStudyPlan(slug);
  if (!plan) return null;
  const allProgress = getStudyPlanProgress();
  return mergeProgress(plan, allProgress);
}

/* ----------------------------- daily picker ------------------------------- */

/**
 * Pick a random study plan, then pick its next sequential uncompleted problem
 * based on user progress. If all problems in that plan are complete, falls back
 * to the first problem or another plan.
 *
 * @param {{ excludePlanSlug?: string }} [options]
 */
export async function pickRandomStudyPlanProblem(options = {}) {
  const allProgress = getStudyPlanProgress();

  // Load all plans (from cache — fast after first fetch)
  const plans = (
    await Promise.all(STUDY_PLANS.map((m) => getStudyPlan(m.slug)))
  ).filter(Boolean);

  if (!plans.length) return null;

  // Build candidate plans with their next sequential uncompleted problem
  const planCandidates = plans.map((plan) => {
    const done = new Set((allProgress[plan.slug] || {}).completedProblems || []);
    let nextProblem = null;
    let seqCounter = 0;
    let foundIndex = 0;
    const totalCount = plan.totalProblems || 0;

    for (const group of plan.groups) {
      for (const prob of group.problems) {
        seqCounter++;
        if (!nextProblem && !done.has(prob.slug)) {
          foundIndex = seqCounter;
          nextProblem = {
            planSlug: plan.slug,
            planName: plan.name,
            planIcon: plan.icon || '📚',
            groupName: group.name,
            slug: prob.slug,
            title: prob.title,
            difficulty: prob.difficulty,
            url: `https://leetcode.com/problems/${prob.slug}/`,
            source: 'studyplan',
            planIndex: foundIndex,
            totalProblems: totalCount,
            completedCount: done.size,
          };
        }
      }
    }

    const firstProb = plan.groups[0]?.problems[0];
    const fallbackProblem = firstProb ? {
      planSlug: plan.slug,
      planName: plan.name,
      planIcon: plan.icon || '📚',
      groupName: plan.groups[0].name,
      slug: firstProb.slug,
      title: firstProb.title,
      difficulty: firstProb.difficulty,
      url: `https://leetcode.com/problems/${firstProb.slug}/`,
      source: 'studyplan',
      planIndex: 1,
      totalProblems: totalCount,
      completedCount: done.size,
    } : null;

    return {
      plan,
      isCompleted: !nextProblem && totalCount > 0,
      nextProblem: nextProblem || fallbackProblem,
    };
  }).filter((c) => c.nextProblem !== null);

  if (!planCandidates.length) return null;

  // Prefer incomplete plans first
  let pool = planCandidates.filter((c) => !c.isCompleted);
  if (!pool.length) pool = planCandidates;

  // If excludePlanSlug is provided (e.g. from reroll/shuffle) and there are other options, switch plans
  if (options?.excludePlanSlug && pool.length > 1) {
    const filtered = pool.filter((c) => c.plan.slug !== options.excludePlanSlug);
    if (filtered.length > 0) pool = filtered;
  }

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen.nextProblem;
}
