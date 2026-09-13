import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { getEulerProgress, markEulerProblem } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../data/project_euler_problems.json');
const CONTENT_CACHE_DIR = path.resolve(__dirname, '../data/euler_content');

let cachedProblems = null;
let lastSyncTime = null;

// Ensure content cache directory exists
try {
  fs.mkdirSync(CONTENT_CACHE_DIR, { recursive: true });
} catch {
  // ignore
}

export function getAllEulerProblems() {
  if (!cachedProblems) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      cachedProblems = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load project_euler_problems.json:', e);
      cachedProblems = [];
    }
  }
  return cachedProblems;
}

export function getEulerProblemById(id) {
  const all = getAllEulerProblems();
  const numId = Number(id);
  return all.find((p) => p.id === numId) || null;
}

/**
 * Fetch minimal HTML description for a specific problem (e.g. https://projecteuler.net/minimal=1).
 * Caches on local disk to avoid repetitive network requests.
 */
export async function getEulerProblemContent(id) {
  const numId = Number(id);
  const cacheFile = path.join(CONTENT_CACHE_DIR, `${numId}.html`);

  if (fs.existsSync(cacheFile)) {
    try {
      return fs.readFileSync(cacheFile, 'utf8');
    } catch {
      // fallback to network
    }
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'projecteuler.net',
      path: `/minimal=${numId}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          fs.writeFileSync(cacheFile, body, 'utf8');
        } catch {
          // ignore cache write error
        }
        resolve(body);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * Returns all Project Euler problems annotated with user completion status.
 */
export function getEulerProblemsWithProgress() {
  const all = getAllEulerProblems();
  const progress = getEulerProgress();
  const completedSet = new Set(progress.completedProblems || []);

  let easyTotal = 0, easyDone = 0;
  let medTotal = 0, medDone = 0;
  let hardTotal = 0, hardDone = 0;

  const problems = all.map((p) => {
    const isDone = completedSet.has(p.id);
    if (p.difficulty === 'Easy') {
      easyTotal++;
      if (isDone) easyDone++;
    } else if (p.difficulty === 'Hard') {
      hardTotal++;
      if (isDone) hardDone++;
    } else {
      medTotal++;
      if (isDone) medDone++;
    }
    return {
      ...p,
      done: isDone,
    };
  });

  return {
    totalProblems: all.length,
    totalCompleted: completedSet.size,
    completedProblems: Array.from(completedSet),
    stats: {
      total: all.length,
      solved: completedSet.size,
      byDifficulty: {
        Easy: { total: easyTotal, solved: easyDone },
        Medium: { total: medTotal, solved: medDone },
        Hard: { total: hardTotal, solved: hardDone },
      },
      easy: { total: easyTotal, completed: easyDone },
      medium: { total: medTotal, completed: medDone },
      hard: { total: hardTotal, completed: hardDone },
    },
    cache: getEulerCacheStatus(),
    problems,
  };
}

/**
 * Daily sequential Project Euler problem picker:
 * Problem #1 today (2026-09-12), #2 tomorrow, etc.
 * Or picks lowest unsolved / next sequential problem.
 */
export async function getDailyEulerProblem(options = {}) {
  const all = getAllEulerProblems();
  if (!all.length) return null;

  const progress = getEulerProgress();
  const completedSet = new Set(progress.completedProblems || []);

  // Compute sequential target ID based on days since anchor (2026-09-12)
  const anchorDate = new Date('2026-09-12T00:00:00Z');
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayOffset = Math.max(0, Math.floor((todayUtc - anchorDate) / 86400000));
  let targetId = dayOffset + 1;

  if (options.unsolvedOnly || options.reroll) {
    // If rerolling or picking next unsolved:
    const unsolved = all.filter((p) => !completedSet.has(p.id));
    if (options.excludeId) {
      const candidates = unsolved.filter((p) => p.id !== options.excludeId);
      targetId = candidates.length ? candidates[0].id : (unsolved.length ? unsolved[0].id : targetId);
    } else {
      targetId = unsolved.length ? unsolved[0].id : targetId;
    }
  } else if (options.id) {
    targetId = Number(options.id);
  }

  let problem = getEulerProblemById(targetId);
  if (!problem) {
    problem = all[0];
  }

  const content = await getEulerProblemContent(problem.id).catch(() => null);

  return {
    slug: `euler-${problem.id}`,
    title: `Problem ${problem.id}: ${problem.title}`,
    name: problem.title,
    eulerId: problem.id,
    difficulty: problem.difficulty || 'Medium',
    solvedBy: problem.solvedBy,
    url: `https://projecteuler.net/problem=${problem.id}`,
    video: `https://www.youtube.com/results?search_query=${encodeURIComponent('Project Euler Problem ' + problem.id + ' solution')}`,
    content: content || null,
    isEuler: true,
    source: 'project-euler',
  };
}

/**
 * Automatically sync latest problems and solver counts from https://projecteuler.net/minimal=problems.
 * Never deletes or wipes user progress.
 */
export async function syncEulerProblems() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'projecteuler.net',
      path: '/minimal=problems',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Project Euler sync HTTP ${res.statusCode}`));
        return;
      }

      let rawText = '';
      res.on('data', (chunk) => (rawText += chunk));
      res.on('end', () => {
        try {
          const lines = rawText.trim().split('\n');
          if (lines.length < 2) {
            reject(new Error('Invalid response from Project Euler'));
            return;
          }

          const existing = getAllEulerProblems();
          const existingMap = new Map(existing.map((p) => [p.id, p]));
          let newCount = 0;

          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].trim().split('##');
            if (parts.length < 4) continue;

            const pid = parseInt(parts[0], 10);
            const title = parts[1];
            const published = parts[2];
            const solvedBy = parseInt(parts[3], 10) || 0;

            let diff = 'Hard';
            if (solvedBy >= 40000) diff = 'Easy';
            else if (solvedBy >= 4000) diff = 'Medium';

            if (!existingMap.has(pid)) {
              newCount++;
              existingMap.set(pid, {
                id: pid,
                title,
                published,
                solvedBy,
                difficulty: diff,
                url: `https://projecteuler.net/problem=${pid}`,
                code: `euler-${pid}`,
              });
            } else {
              const current = existingMap.get(pid);
              current.title = title;
              current.solvedBy = solvedBy;
              current.difficulty = diff;
            }
          }

          const updatedList = Array.from(existingMap.values()).sort((a, b) => a.id - b.id);
          fs.writeFileSync(DATA_FILE, JSON.stringify(updatedList, null, 2), 'utf8');
          cachedProblems = updatedList;
          lastSyncTime = new Date().toISOString();

          resolve({
            ok: true,
            totalProblems: updatedList.length,
            newProblemsAdded: newCount,
            lastSyncedAt: lastSyncTime,
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Project Euler request timed out'));
    });
    req.end();
  });
}

export function getEulerCacheStatus() {
  try {
    const stat = fs.statSync(DATA_FILE);
    const ageHours = Math.round((Date.now() - stat.mtimeMs) / 3600000);
    const problems = getAllEulerProblems();
    return {
      problemCount: problems.length,
      lastModified: stat.mtime.toISOString(),
      cacheAgeHours: ageHours,
    };
  } catch {
    return {
      problemCount: 0,
      lastModified: null,
      cacheAgeHours: null,
    };
  }
}
