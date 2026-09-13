/** Small API client for the local server. */
import { pushToast } from '../components/ToastHost';
import { fireConfetti } from './confetti';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface RoadmapSummary {
  slug: string;
  title: string;
  cardTitle: string;
  description: string;
  nodeCount: number;
  doneCount: number;
  learningCount?: number;
  /** Topics done in another roadmap (only when the count-covered setting is on). */
  coveredCount?: number;
  updatedAt: string | null;
  isCustom: boolean;
}

export type ThemeName = 'light' | 'paper' | 'dark' | 'midnight';

/** One recurring daily task, as returned by the board endpoint. */
export interface DailyProblem {
  slug: string | null;
  title: string | null;
  frontendId?: string | null;
  difficulty: string | null;
  acceptanceRate?: number | null;
  acRate?: number | null;
  likes?: number | null;
  dislikes?: number | null;
  totalAccepted?: number | null;
  totalSubmission?: number | null;
  topicTags?: string[];
  source?: string | null;
  notes?: string[];
  /** Quests are interactive on leetcode.com — we link out instead of resolving one problem. */
  isQuest?: boolean;
  questSlug?: string | null;
  questUrl?: string | null;
  units?: QuestUnit[];
  totalLevels?: number;
  completedLevels?: number;
  activeUnit?: QuestUnit | null;
  nextLevel?: string | null;
  /** Study plan fields */
  planSlug?: string | null;
  planName?: string | null;
  planIcon?: string | null;
  groupName?: string | null;
  planIndex?: number | null;
  totalProblems?: number | null;
  completedCount?: number | null;
  /** NeetCode fields */
  isNeetcode?: boolean;
  code?: string | null;
  pattern?: string | null;
  video?: string | null;
  videoId?: string | null;
  neetcodeUrl?: string | null;
  leetcodeUrl?: string | null;
  leetcodeSlug?: string | null;
  isNc150?: boolean;
  isBlind75?: boolean;
  isNc250?: boolean;
  isMl?: boolean;
  sectionName?: string | null;
  /** Project Euler fields */
  isEuler?: boolean;
  eulerId?: number | null;
  solvedBy?: number | null;
  content?: string | null;
  url?: string | null;
}

export interface QuestUnit {
  id: string;
  name: string;
  icon?: string | null;
  total: number;
  completed: number;
  status: 'locked' | 'active' | 'completed';
  currentLevel: number;
}

export interface QuestTrack {
  id?: string;
  slug: string;
  name: string;
  category?: string;
  icon?: string | null;
  units: QuestUnit[];
  totalLevels: number;
  completedLevels: number;
  completedUnits: number;
  totalUnits: number;
  percent: number;
  isCompleted: boolean;
  activeUnit: QuestUnit | null;
  nextLevel: string | null;
}

export interface StudyPlanProblem {
  id: string;
  title: string;
  slug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  paidOnly: boolean;
  done?: boolean;
}

export interface StudyPlanGroup {
  slug: string;
  name: string;
  problems: StudyPlanProblem[];
  completedCount: number;
}

export interface StudyPlanSummary {
  slug: string;
  name: string;
  icon: string;
  highlight: string;
  totalProblems: number;
  completedCount: number;
  isCompleted: boolean;
  error?: string;
}

export interface StudyPlanDetail extends StudyPlanSummary {
  groups: StudyPlanGroup[];
  completedProblems: string[];
  fetchedAt?: string;
}

export interface NeetcodeProblem {
  name: string;
  pattern: string;
  link: string;
  video: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  is_pro: boolean;
  is_free: boolean;
  is_nc150: boolean;
  is_blind75: boolean;
  is_nc250: boolean;
  is_ml?: boolean;
  sectionName?: string;
  nc_link: string;
  code: string;
  done?: boolean;
}

export interface NeetcodePatternGroup {
  pattern: string;
  problems: NeetcodeProblem[];
  total: number;
  completedCount: number;
}

export interface NeetcodeProblemsResponse {
  ok: boolean;
  totalProblems: number;
  totalCompleted: number;
  completedProblems: string[];
  groups: NeetcodePatternGroup[];
}

export interface EulerProblem {
  id: number;
  title: string;
  published: string;
  solvedBy: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  code: string;
  done?: boolean;
}

export interface EulerProblemsResponse {
  ok: boolean;
  totalProblems: number;
  totalCompleted: number;
  completedProblems: number[];
  stats: {
    total?: number;
    solved?: number;
    byDifficulty?: Record<string, { total: number; solved: number }>;
    easy: { total: number; completed: number };
    medium: { total: number; completed: number };
    hard: { total: number; completed: number };
  };
  cache?: EulerCacheStatus;
  problems: EulerProblem[];
}

export interface EulerCacheStatus {
  problemCount: number;
  lastModified: string | null;
  cacheAgeHours: number | null;
}

export interface DailyCard {
  id: string;
  kind: 'potd' | 'random' | 'quest' | 'studyplan' | 'neetcode' | 'euler' | 'roadmap' | 'custom';
  title: string;
  description: string;
  enabled: boolean;
  order: number;
  quest?: { difficulty?: string; tags?: string[] };
  problem?: DailyProblem | null;
  completion?: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    solveSeconds: number | null;
    outcome: string;
    attemptsToday: number;
  } | null;
  doneToday?: boolean;
}

export interface DailyStats {
  currentStreak: number;
  longestStreak: number;
  totalAttempts: number;
  totalSolved: number;
  completionRate: number;
  byDifficulty: Record<string, { attempts: number; solved: number; rate: number }>;
  avgSolveSeconds: number | null;
  activeDays: number;
  trend: { date: string; attempts: number; solved: number }[];
}

/** LeetCode profile as exposed by /api/leetcode/profile (public, no auth). */
export interface LeetCodeProfile {
  configured: boolean;
  authenticated: boolean;
  username?: string;
  profile: {
    username: string;
    realName: string | null;
    avatar: string | null;
    country: string | null;
    solved: { All: number | null; Easy: number | null; Medium: number | null; Hard: number | null };
    attempts: number | null;
    acceptanceRate: number | null;
    ranking: number | null;
    reputation: number | null;
    streak: number | null;
    totalActiveDays: number | null;
    calendar: { date: string; count: number }[];
    languages: { languageName: string; problemsSolved: number }[];
    tags: { tagName: string; problemsSolved: number }[];
    contest: {
      rating: number | null;
      globalRanking: number | null;
      totalParticipants: number | null;
      attended: number | null;
      topPercentage: number | null;
    } | null;
    recent: { title: string; slug: string; at: string }[];
    fetchedAt: string;
  } | null;
  error?: string;
}

export interface HistoryRow {
  taskId: string;
  at: string;
  dateKey: string;
  outcome: string;
  seconds: number | null;
  problem: DailyProblem | null;
}

/** Themes retired in the 2026-09 redesign → closest surviving theme. */
const LEGACY_THEME_MAP: Record<string, ThemeName> = {
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

/** Coerce any stored/legacy theme string to a theme we actually ship. */
export function normalizeTheme(value: unknown): ThemeName {
  const name = String(value ?? '');
  if (name === 'light' || name === 'paper' || name === 'dark' || name === 'midnight') {
    return name;
  }
  return LEGACY_THEME_MAP[name] || 'light';
}

/**
 * The official snapshots embed template tokens that roadmap.sh substitutes at
 * render time — most visibly `@currentYear@`, which appears in 84 of the 97
 * roadmap descriptions. Nothing was resolving them, so they rendered literally
 * ("…a modern frontend developer in @currentYear@"). Resolved once here, at the
 * API boundary, so every consumer gets display-ready text.
 */
export function substituteTokens(text: string): string {
  return text.replace(/@currentYear@/g, String(new Date().getFullYear()));
}

function cleanSummary(r: RoadmapSummary): RoadmapSummary {
  return {
    ...r,
    title: substituteTokens(r.title ?? ''),
    cardTitle: substituteTokens(r.cardTitle ?? ''),
    description: substituteTokens(r.description ?? ''),
  };
}

function cleanRoadmap(rm: import('./types').Roadmap): import('./types').Roadmap {
  return {
    ...rm,
    title: rm.title
      ? {
          card: rm.title.card ? substituteTokens(rm.title.card) : rm.title.card,
          page: rm.title.page ? substituteTokens(rm.title.page) : rm.title.page,
        }
      : rm.title,
    description: rm.description ? substituteTokens(rm.description) : rm.description,
  };
}

export interface ActivityEvent {
  type: string;
  at: string;
  slug?: string;
  nodeId?: string;
  label?: string;
  from?: string | null;
  to?: string | null;
  mode?: string;
}

export const api = {
  listRoadmaps: () => get<RoadmapSummary[]>('/api/roadmaps').then((rows) => rows.map(cleanSummary)),
  getRoadmap: (slug: string) =>
    get<import('./types').Roadmap>(`/api/roadmaps/${encodeURIComponent(slug)}`).then(cleanRoadmap),
  getNodeContent: (slug: string, nodeId: string) =>
    get<{ content: string | null }>(
      `/api/roadmaps/${encodeURIComponent(slug)}/node/${encodeURIComponent(nodeId)}/content`,
    ),
  getProgress: () =>
    get<{ nodeProgress: Record<string, Record<string, string>>; roadmapStatus: Record<string, string> }>(
      '/api/progress',
    ),
  /** Done-topic labels per roadmap — powers "covered" (done elsewhere) display. */
  getCrossProgress: () =>
    get<{ doneLabelsBySlug: Record<string, string[]> }>('/api/cross-progress'),
  getSettings: () =>
    get<{ dailyGoal: number; countCoveredAsDone: boolean; theme: ThemeName }>('/api/settings'),
  setCountCovered: (enabled: boolean) =>
    send<{ ok: true; countCoveredAsDone: boolean }>('/api/settings/count-covered', 'POST', { enabled }),
  setTheme: (theme: ThemeName) =>
    send<{ ok: true; theme: ThemeName }>('/api/settings/theme', 'POST', { theme }),
  setNodeStatus: async (slug: string, nodeId: string, status: string | null) => {
    const res = await send<{
      ok: true;
      goalReached?: boolean;
      dailyGoal?: number;
      todayCount?: number;
      streakMilestone?: number | null;
    }>('/api/progress/node', 'POST', { slug, nodeId, status });
    // Streak milestones are rarer — they take precedence over the goal toast.
    if (res.streakMilestone) {
      fireConfetti();
      pushToast({
        tone: 'streak',
        message: `${res.streakMilestone}-day study streak! 🔥`,
        sub: `You've shown up ${res.streakMilestone} days in a row. Impressive consistency!`,
      });
    } else if (res.goalReached) {
      // celebrate exactly when the action crosses the daily-goal threshold (server decides)
      pushToast({
        message: `Daily goal reached — ${res.todayCount} actions today!`,
        sub: 'Streak is safe. Keep going or call it a day 🎯',
      });
    }
    return res;
  },
  setRoadmapStatus: (slug: string, status: string | null) =>
    send('/api/progress/roadmap', 'POST', { slug, status }),
  resetProgress: () => send('/api/progress/reset', 'POST'),

  /* ------------------------- third-party connectors ----------------------- */
  getConnectors: () =>
    get<{
      connectors: {
        id: string;
        name: string;
        kind: string;
        description: string;
        docs: string;
        fields: { key: string; label: string; type: string; placeholder?: string; configured: boolean }[];
        enabled: boolean;
        configured: boolean;
        queued: number;
        lastError: string | null;
        lastSyncAt: string | null;
      }[];
    }>('/api/connectors'),
  saveConnectorConfig: (id: string, config: Record<string, unknown>) =>
    send<{ ok: true }>(`/api/connectors/${encodeURIComponent(id)}/config`, 'PUT', config),
  testConnector: (id: string) =>
    send<{ ok: true; detail?: string }>(`/api/connectors/${encodeURIComponent(id)}/test`, 'POST'),
  syncConnector: (id: string) =>
    send<{ ok: boolean; pushed?: number; detail?: string; error?: string }>(
      `/api/connectors/${encodeURIComponent(id)}/sync`,
      'POST',
    ),
  flushConnector: (id: string) =>
    send<{ ok: boolean; pushed?: number; remaining?: number; error?: string }>(
      `/api/connectors/${encodeURIComponent(id)}/flush`,
      'POST',
    ),
  clearConnectorQueue: (id: string) =>
    send<{ ok: true }>(`/api/connectors/${encodeURIComponent(id)}/queue`, 'DELETE'),

  /* --------------------------------- dailys -------------------------------- */
  getDailysBoard: () =>
    get<{
      date: string;
      dailys: DailyCard[];
      summary: { total: number; done: number };
    }>('/api/dailys/board'),
  getDailysStats: () => get<DailyStats>('/api/dailys/stats'),
  getDailysHistory: (params: { limit?: number; offset?: number; taskId?: string; outcome?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.taskId) q.set('taskId', params.taskId);
    if (params.outcome) q.set('outcome', params.outcome);
    const qs = q.toString();
    return get<{ total: number; rows: HistoryRow[] }>(
      `/api/dailys/history${qs ? `?${qs}` : ''}`,
    );
  },
  recordDailyAttempt: (taskId: string, body: { outcome?: string; seconds?: number | null; problem?: unknown }) =>
    send<{ ok: true; completion: unknown }>(`/api/dailys/${encodeURIComponent(taskId)}/attempt`, 'POST', body),
  clearDaily: (taskId: string) => send<{ ok: boolean }>(`/api/dailys/${encodeURIComponent(taskId)}/clear`, 'POST'),
  rerollDaily: (taskId: string) =>
    send<{ ok: true; problem: unknown }>(`/api/dailys/${encodeURIComponent(taskId)}/reroll`, 'POST'),
  getDailyDefinitions: () => get<{ definitions: DailyCard[] }>('/api/dailys/definitions'),
  addDailyDefinition: (def: {
    title: string;
    kind?: string;
    description?: string;
    enabled?: boolean;
    quest?: { difficulty?: string; tags?: string[] };
  }) => send<{ ok: true; definition: DailyCard }>('/api/dailys/definitions', 'POST', def),
  updateDailyDefinition: (id: string, patch: Record<string, unknown>) =>
    send<{ ok: true; definition: DailyCard }>(`/api/dailys/definitions/${encodeURIComponent(id)}`, 'PUT', patch),
  deleteDailyDefinition: (id: string) =>
    send<{ ok: boolean }>(`/api/dailys/definitions/${encodeURIComponent(id)}`, 'DELETE'),
  getDailysCache: () =>
    get<{ entries: number; problemsetAgeHours: number | null; problemCount: number }>('/api/dailys/cache'),
  getLeetCodeProfile: (username?: string) =>
    get<LeetCodeProfile>(`/api/leetcode/profile${username ? `?username=${encodeURIComponent(username)}` : ''}`),
  getLeetCodeUsername: () => get<{ username: string }>('/api/leetcode/username'),
  setLeetCodeUsername: (username: string) =>
    send<{ ok: true; username: string }>('/api/leetcode/username', 'PUT', { username }),
  getLeetCodeQuests: () =>
    get<{ quests: QuestTrack[]; source: 'live' | 'fallback' }>('/api/leetcode/quests'),
  updateQuestProgress: (
    slug: string,
    unitId: string,
    options?: {
      action?: 'increment' | 'decrement' | 'set' | 'complete_unit' | 'reset';
      levels?: number;
      maxLevels?: number;
    },
  ) =>
    send<{ ok: true; quest: QuestTrack; allQuests: QuestTrack[] }>('/api/leetcode/quests/progress', 'POST', {
      slug,
      unitId,
      ...options,
    }),
  getSuggestedQuest: () =>
    get<{ ok: true; quest: QuestTrack }>('/api/leetcode/quests/suggest'),
  getLeetCodeRatings: () =>
    get<{ ratings: Record<string, { rating: number; title: string; difficulty: string; attempts: number; averageTimePerAttempt: number; solved: boolean; notes?: string; updatedAt: string }> }>('/api/leetcode/ratings'),
  rateLeetCodeProblem: (slug: string, rating?: number, title?: string, difficulty?: string, timeSeconds?: number, outcome?: string, notes?: string) =>
    send<{ ok: true; rating: any }>('/api/leetcode/ratings', 'POST', { slug, rating, title, difficulty, timeSeconds, outcome, notes }),

  // Study plans
  getStudyPlans: () =>
    get<{ ok: true; plans: StudyPlanSummary[] }>('/api/studyplans'),
  getStudyPlan: (slug: string) =>
    get<{ ok: true; plan: StudyPlanDetail }>(`/api/studyplans/${encodeURIComponent(slug)}`),
  markStudyPlanProblem: (planSlug: string, problemSlug: string, done: boolean) =>
    send<{ ok: true }>(`/api/studyplans/${encodeURIComponent(planSlug)}/problems/${encodeURIComponent(problemSlug)}`, 'POST', { done }),

  // NeetCode
  getNeetcodeProblems: () =>
    get<NeetcodeProblemsResponse>('/api/neetcode/problems'),
  markNeetcodeProblem: (code: string, done: boolean) =>
    send<{ ok: true; code: string; done: boolean; progress: { completedProblems: string[]; lastUpdated: string } }>(
      `/api/neetcode/problems/${encodeURIComponent(code)}`,
      'POST',
      { done },
    ),
  getRandomNeetcodeProblem: (options?: { difficulty?: string; pattern?: string }) =>
    get<{ ok: true; problem: DailyProblem }>(
      `/api/neetcode/random${options ? `?${new URLSearchParams(options as Record<string, string>).toString()}` : ''}`,
    ),

  // Project Euler
  getEulerProblems: () =>
    get<EulerProblemsResponse>('/api/euler/problems'),
  markEulerProblem: (id: number | string, done: boolean) =>
    send<{ ok: true; id: number; done: boolean; progress: { completedProblems: number[]; lastUpdated: string } }>(
      `/api/euler/problems/${id}`,
      'POST',
      { done },
    ),
  getEulerCache: () =>
    get<EulerCacheStatus>('/api/euler/cache'),
  syncEulerProblems: () =>
    send<{ ok: true; totalProblems: number; newProblemsAdded: number; lastSyncedAt: string }>(
      '/api/euler/sync',
      'POST',
    ),
  getEulerContent: (id: number | string) =>
    get<{ ok: true; id: number; content: string | null }>(`/api/euler/problems/${id}/content`),

  createCustomRoadmap: (title: string, description: string) =>
    send<import('./types').Roadmap>('/api/custom-roadmaps', 'POST', { title, description }),
  forkCustomRoadmap: (slug: string) =>
    send<import('./types').Roadmap>('/api/custom-roadmaps/fork', 'POST', { slug }),
  saveCustomRoadmap: (slug: string, payload: { title?: string; description?: string; nodes?: unknown[]; edges?: unknown[] }) =>
    send(`/api/custom-roadmaps/${encodeURIComponent(slug)}`, 'PUT', payload),
  deleteCustomRoadmap: (slug: string) =>
    send(`/api/custom-roadmaps/${encodeURIComponent(slug)}`, 'DELETE'),
  search: (q: string) =>
    get<{
      results: {
        roadmapSlug: string;
        roadmapTitle: string;
        nodeId: string;
        label: string;
        score: number;
      }[];
    }>(`/api/search?q=${encodeURIComponent(q)}`),
  searchFullText: (q: string, limit = 50) =>
    get<{
      results: {
        roadmapSlug: string;
        roadmapTitle: string;
        nodeId: string;
        label: string;
        matchType: 'title' | 'note' | 'content';
        excerpt: string;
        score: number;
      }[];
    }>(`/api/search/fulltext?q=${encodeURIComponent(q)}&limit=${limit}`),
  /**
   * @param scope 'due' (default) returns only items due today or earlier.
   *              'all' also folds in upcoming items so you can practise early —
   *              otherwise the deck is empty for the whole first day after
   *              marking a topic done, which reads as a broken Review screen.
   */
  getReviews: (scope: 'due' | 'all' = 'due') =>
    get<{
      due: {
        slug: string;
        nodeId: string;
        label: string;
        /** Ladder stage just completed; next interval = intervals[stage + 1]. */
        stage: number;
        /** Length of the interval just completed (days). */
        intervalDays: number;
        dueAt: string;
        overdueDays: number;
        /** True when the item is not due yet but was included via scope=all. */
        early?: boolean;
        hoursUntil?: number;
      }[];
      /** Soonest not-yet-due review, so the UI can say when to come back. */
      nextUpcoming: ({
        slug: string;
        nodeId: string;
        label: string;
        stage: number;
        intervalDays: number;
        dueAt: string;
        overdueDays: number;
        early: boolean;
        hoursUntil: number;
      } | null);
      upcomingCount: number;
      intervals: number[];
    }>(scope === 'all' ? '/api/reviews?scope=all' : '/api/reviews'),
  answerReview: (slug: string, nodeId: string, grade: 'good' | 'again' | 'hard' | 'easy' | 'dismiss') =>
    send<{
      ok: true;
      removed?: boolean;
      stage?: number;
      graduated?: boolean;
      nextDueAt?: string;
      nextIntervalDays?: number;
    }>(`/api/reviews/${encodeURIComponent(slug)}/${encodeURIComponent(nodeId)}/answer`, 'POST', { grade }),
  snoozeAllReviews: (days = 1) =>
    send<{ ok: true; moved: number }>('/api/reviews/snooze-all', 'POST', { days }),
  getNotes: (slug: string) =>
    get<{ notes: Record<string, string> }>(`/api/notes/${encodeURIComponent(slug)}`),
  setNote: (slug: string, nodeId: string, note: string | null) =>
    send(`/api/notes/${encodeURIComponent(slug)}`, 'POST', { nodeId, note }),
  getTimeTracked: () =>
    get<{ timeTracked: Record<string, Record<string, number>> }>('/api/time'),
  addTimeTracked: (slug: string, nodeId: string, seconds: number, mode: 'add' | 'set' = 'add') =>
    send<{ ok: true; total: number }>(`/api/time/${encodeURIComponent(slug)}/${encodeURIComponent(nodeId)}`, 'POST', { seconds, mode }),
  getStreaks: () =>
    get<{
      currentStreak: number;
      longestStreak: number;
      activeDays: number;
      totalActions: number;
      dailyGoal: number;
      todayCount: number;
      /** Next streak milestone (e.g. 7, 14, 30…) or null if 365 is passed. */
      nextMilestone: number | null;
      /** Map of `YYYY-MM-DD` -> number of study actions that day. */
      days: Record<string, number>;
    }>('/api/streaks'),
  setDailyGoal: (goal: number) =>
    send('/api/settings/daily-goal', 'POST', { goal }),
  getActivity: (limit = 50) =>
    get<{ events: ActivityEvent[] }>(`/api/activity?limit=${limit}`),
  exportBackup: () =>
    get<{
      version: number;
      exportedAt: string;
      nodeProgress: Record<string, Record<string, string>>;
      roadmapStatus: Record<string, string>;
      nodeNotes: Record<string, Record<string, string>>;
      customRoadmaps: unknown[];
      reviewSchedule: Record<string, { stage: number; dueAt: string; doneAt: string }>;
      theme?: ThemeName;
    }>('/api/backup'),
  restoreBackup: (payload: unknown) => send('/api/backup/restore', 'POST', payload),
  getStats: () =>
    get<{
      totalDone: number;
      /** Topics done elsewhere (only when countCoveredAsDone is on). */
      totalCovered: number;
      totalLearning: number;
      totalSkipped: number;
      totalNodes: number;
      totalTimeTracked: number;
      perRoadmap: {
        slug: string;
        title: string;
        isCustom: boolean;
        nodeCount: number;
        learning: number;
        done: number;
        skipped: number;
        coveredCount: number;
        timeTracked: number;
        pct: number;
      }[];
    }>('/api/stats'),

  // Habitica
  getHabiticaProfile: () => get<HabiticaProfile>('/api/habitica/profile'),
  getHabiticaTasks: (type?: 'habits' | 'dailys' | 'todos') =>
    get<{ tasks: HabiticaTask[] }>(`/api/habitica/tasks${type ? `?type=${type}` : ''}`),
  createHabiticaTask: (payload: Partial<HabiticaTask>) =>
    send<{ ok: boolean; task: HabiticaTask }>('/api/habitica/tasks', 'POST', payload),
  scoreHabiticaTask: (id: string, direction: 'up' | 'down' = 'up', roadmapKey?: string) =>
    send<{ ok: boolean }>('/api/habitica/tasks/' + id + '/score', 'POST', { direction, roadmapKey }),
  deleteHabiticaTask: (id: string) =>
    send<{ ok: boolean }>('/api/habitica/tasks/' + id, 'DELETE'),
  syncHabiticaDailies: () =>
    send<{ ok: boolean; created?: any[]; matched?: any[]; error?: string }>('/api/habitica/sync-dailies', 'POST'),

  // Google Calendar
  getCalendarStatus: () => get<CalendarStatus>('/api/calendar/status'),
  syncCalendarFreeSlots: () =>
    send<{ ok: boolean; calendarId: string; freeSlotsCount: number; scheduled: any[]; updated: any[] }>('/api/calendar/sync-free-slots', 'POST'),

  getVaultConfig: () => get<VaultConfig>('/api/vault/config'),
  setVaultConfig: (cfg: { enabled?: boolean; path?: string; autoWatch?: boolean }) =>
    send<{ ok: true; config: VaultConfig }>('/api/vault/config', 'POST', cfg),
  syncVault: () => send<VaultSyncResult>('/api/vault/sync', 'POST'),
  exportAllToVault: () => send<VaultExportResult>('/api/vault/export-all', 'POST'),
};

export interface HabiticaProfile {
  configured: boolean;
  id?: string;
  name?: string;
  username?: string;
  lvl?: number;
  class?: string;
  hp?: number;
  maxHealth?: number;
  mp?: number;
  maxMP?: number;
  exp?: number;
  toNextLevel?: number;
  gp?: number;
  error?: string;
}

export interface HabiticaTask {
  id: string;
  _id?: string;
  text: string;
  type: 'habit' | 'daily' | 'todo' | 'reward';
  notes?: string;
  priority?: number;
  completed?: boolean;
  streak?: number;
  up?: boolean;
  down?: boolean;
  tags?: string[];
  frequency?: string;
  everyX?: number;
  date?: string;
}

export interface CalendarStatus {
  configured: boolean;
  calendarId?: string | null;
  connected?: boolean;
  freeSlotsCount?: number;
  existingEventsCount?: number;
  error?: string;
  freeSlots?: Array<{ start: string; end: string; durationMinutes: number }>;
}

export interface VaultConfig {
  enabled: boolean;
  path: string;
  isDefault: boolean;
  exists: boolean;
  fileCount: number;
  lastSyncedAt: string | null;
  autoWatch: boolean;
}

export interface VaultSyncResult {
  ok: boolean;
  filesScanned: number;
  notesUpdated: number;
  progressUpdated: number;
  syncedAt: string;
}

export interface VaultExportResult {
  ok: boolean;
  vaultDir: string;
  exportedNotes: number;
  exportedOverviews: number;
  totalRoadmaps: number;
  timestamp: string;
}

