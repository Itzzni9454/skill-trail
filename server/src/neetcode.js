import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNeetcodeProgress } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/neetcode_problems.json');

let cachedProblems = null;

export function getAllNeetcodeProblems() {
  if (!cachedProblems) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      cachedProblems = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load neetcode_problems.json:', e);
      cachedProblems = [];
    }
  }
  return cachedProblems;
}

/**
 * Returns all problems grouped by their pattern/category, annotated with user completion status.
 */
export function getNeetcodePatternsWithProgress() {
  const all = getAllNeetcodeProblems();
  const progress = getNeetcodeProgress();
  const completedSet = new Set(progress.completedProblems || []);

  const groupsMap = new Map();

  for (const prob of all) {
    const pattern = prob.pattern || 'Other';
    if (!groupsMap.has(pattern)) {
      groupsMap.set(pattern, {
        pattern,
        problems: [],
        total: 0,
        completedCount: 0,
      });
    }
    const group = groupsMap.get(pattern);
    const isDone = completedSet.has(prob.code);
    group.problems.push({
      ...prob,
      done: isDone,
    });
    group.total += 1;
    if (isDone) group.completedCount += 1;
  }

  const groups = Array.from(groupsMap.values());
  const totalProblems = all.length;
  const totalCompleted = completedSet.size;

  return {
    totalProblems,
    totalCompleted,
    completedProblems: Array.from(completedSet),
    groups,
  };
}

/**
 * Picks a random NeetCode problem for daily challenge.
 * Prioritizes uncompleted problems.
 */
export function getRandomNeetcodeProblem(options = {}) {
  const all = getAllNeetcodeProblems();
  if (!all.length) return null;

  let candidates = all.slice();

  if (options.difficulty) {
    candidates = candidates.filter((p) => p.difficulty.toLowerCase() === options.difficulty.toLowerCase());
  }
  if (options.pattern) {
    candidates = candidates.filter((p) => p.pattern.toLowerCase() === options.pattern.toLowerCase());
  }
  if (options.excludeCode) {
    const filtered = candidates.filter((p) => p.code !== options.excludeCode);
    if (filtered.length > 0) candidates = filtered;
  }

  const progress = getNeetcodeProgress();
  const completedSet = new Set(progress.completedProblems || []);

  const uncompleted = candidates.filter((p) => !completedSet.has(p.code));
  const pool = uncompleted.length > 0 ? uncompleted : candidates;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  if (!picked) return null;

  return {
    slug: picked.code,
    title: picked.name,
    difficulty: picked.difficulty,
    pattern: picked.pattern,
    video: picked.video
      ? `https://www.youtube.com/watch?v=${picked.video}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent('NeetCode ' + picked.name + ' solution')}`,
    videoId: picked.video || null,
    neetcodeUrl: picked.nc_link ? `https://neetcode.io/problems/${picked.nc_link}` : 'https://neetcode.io/practice/practice/allNC?access=Free',
    leetcodeUrl: picked.link ? `https://leetcode.com/problems/${picked.link}` : (picked.nc_link ? `https://neetcode.io/problems/${picked.nc_link}` : null),
    leetcodeSlug: picked.link ? picked.link.replace(/\/$/, '') : null,
    code: picked.code,
    isNeetcode: true,
    isNc150: !!picked.is_nc150,
    isBlind75: !!picked.is_blind75,
    isNc250: !!picked.is_nc250,
    isMl: !!picked.is_ml,
    sectionName: picked.sectionName || null,
    source: 'neetcode-all',
  };
}
