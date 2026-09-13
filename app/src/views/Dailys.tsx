import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Clock,
  Code2,
  Compass,
  Dices,
  ExternalLink,
  Flame,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ScrollText,
  Sigma,
  Swords,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Video,
  X,
} from 'lucide-react';
import { api, type DailyCard, type DailyStats, type HistoryRow, type RoadmapSummary, type ActivityEvent } from '../lib/api';
import EmptyState from '../components/EmptyState';
import { SkeletonCards, SkeletonMetrics, LoadingAnnouncer } from '../components/Skeleton';

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: 'var(--theme-done)',
  Medium: 'var(--theme-due)',
  Hard: 'var(--theme-danger)',
};

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Compact 30-day activity strip. */
function Trend({ points }: { points: DailyStats['trend'] }) {
  const max = Math.max(1, ...points.map((p) => p.solved));
  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {points.map((p) => (
        <span
          key={p.date}
          className="w-[6px] rounded-md"
          style={{
            height: `${Math.max(2, (p.solved / max) * 28)}px`,
            backgroundColor: p.solved ? 'var(--theme-primary)' : 'var(--theme-border)',
          }}
          title={`${p.date}: ${p.solved} solved`}
        />
      ))}
    </div>
  );
}

/** Section scaffolding: heading + count, so both grids read the same way. */
function Section({
  title,
  count,
  hint,
  action,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-heading flex items-baseline" style={{ color: 'var(--theme-text)' }}>
          {title}
          <span
            className="tnum ml-2 font-mono text-[12px]"
            style={{ color: 'var(--theme-text-faint)' }}
          >
            {count}
          </span>
        </h2>
        {action}
      </div>
      {hint && (
        <p className="t-micro mb-2.5 max-w-[62ch]" style={{ color: 'var(--theme-text-faint)' }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  );
}

function getDeterministicDefault(slug: string, diff: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash << 5) - hash + slug.charCodeAt(i);
  hash = Math.abs(hash);
  if (diff === 'Easy') return (hash % 3) + 1; // 1-3
  if (diff === 'Medium') return (hash % 4) + 4; // 4-7
  return (hash % 3) + 8; // Hard 8-10
}

function LeetCodeRatingSlider({ slug, difficulty, initialRating, onRate }: { slug: string; title?: string; difficulty?: string; initialRating?: number; onRate: (rating: number) => void }) {
  const defaultVal = useMemo(() => getDeterministicDefault(slug, difficulty || 'Medium'), [slug, difficulty]);
  const val = initialRating ?? defaultVal;

  return (
    <div className="flex items-center gap-2 mt-3 w-full">
      <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>Rating:</span>
      <input
        type="range"
        aria-label="Problem rating, 0 to 10"
        min="0"
        max="10"
        value={val}
        className="flex-1 accent-[var(--theme-primary)]"
        onChange={(e) => onRate(parseInt(e.target.value, 10))}
      />
      <span className="tnum t-micro font-mono w-4 text-right" style={{ color: 'var(--theme-text)' }}>{val}</span>
    </div>
  );
}

export default function Dailys() {
  const [board, setBoard] = useState<Awaited<ReturnType<typeof api.getDailysBoard>> | null>(null);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [cache, setCache] = useState<{ problemCount: number; problemsetAgeHours: number | null } | null>(null);
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, { rating: number }>>({});
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<'custom' | 'potd' | 'random' | 'quest' | 'neetcode' | 'euler'>('custom');
  const [newDifficulty, setNewDifficulty] = useState('Medium');
  const [error, setError] = useState<string | null>(null);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarMsg, setCalendarMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSyncCalendar() {
    setCalendarSyncing(true);
    try {
      const res = await api.syncCalendarFreeSlots();
      if (res.ok) {
        setCalendarMsg({
          type: 'ok',
          text: `Scheduled ${res.scheduled?.length || 0} tasks into today's free calendar slots (${res.calendarId})! 10-min alerts enabled.`,
        });
      }
    } catch (err: any) {
      setCalendarMsg({ type: 'err', text: `Calendar sync error: ${err.message}` });
    } finally {
      setCalendarSyncing(false);
      setTimeout(() => setCalendarMsg(null), 6000);
    }
  }

  // Solve timer: one active timer at a time, keyed by task id.
  const [timerTask, setTimerTask] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!timerTask) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [timerTask]);

  const load = useCallback(async () => {
    try {
      const [b, s, h, c, r, rms, act] = await Promise.all([
        api.getDailysBoard(),
        api.getDailysStats(),
        api.getDailysHistory({ limit: 60 }),
        api.getDailysCache().catch(() => null),
        api.getLeetCodeRatings().catch(() => ({ ratings: {} })),
        api.listRoadmaps().catch(() => []),
        api.getActivity(50).catch(() => ({ events: [] })),
      ]);
      setBoard(b);
      setStats(s);
      setHistory(h.rows);
      setHistoryTotal(h.total);
      setCache(c);
      setRatings(r.ratings || {});
      setRoadmaps(rms || []);
      setActivity(act?.events || []);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startTimer(taskId: string) {
    startedAt.current = Date.now();
    setElapsed(0);
    setTimerTask(taskId);
  }

  async function submit(taskId: string, outcome: string) {
    const card = board?.dailys.find((c) => c.id === taskId);
    const seconds = timerTask === taskId ? elapsed : null;
    setBusy(taskId);
    try {
      const p = card?.problem;
      const slugToRate = p?.slug || p?.questSlug || p?.code;
      if (slugToRate) {
        const currentRating = ratings[slugToRate]?.rating;
        const deterministicRating = currentRating !== undefined ? currentRating : getDeterministicDefault(slugToRate, p?.difficulty || 'Unknown');
        await api.rateLeetCodeProblem(slugToRate, deterministicRating, p?.title || undefined, p?.difficulty || undefined, seconds || 0, outcome);
      }

      await api.recordDailyAttempt(taskId, { outcome, seconds, problem: p ?? null });
      setTimerTask(null);
      await load();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function reroll(taskId: string) {
    setBusy(taskId);
    try {
      await api.rerollDaily(taskId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function clear(taskId: string) {
    setBusy(taskId);
    try {
      await api.clearDaily(taskId);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function addDaily() {
    if (!newTitle.trim()) return;
    setBusy('add');
    try {
      await api.addDailyDefinition({
        title: newTitle.trim(),
        kind: newKind,
        quest: newKind === 'quest' ? { difficulty: newDifficulty } : undefined,
      });
      setNewTitle('');
      setNewKind('custom');
      setAdding(false);
      await load();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function removeDaily(id: string) {
    setBusy(id);
    try {
      await api.deleteDailyDefinition(id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const kindIcon = (kind: string) =>
    kind === 'potd' ? (
      <Target className="h-4 w-4" />
    ) : kind === 'quest' ? (
      <Swords className="h-4 w-4" />
    ) : kind === 'random' ? (
      <Dices className="h-4 w-4" />
    ) : kind === 'studyplan' ? (
      <BookOpen className="h-4 w-4" />
    ) : kind === 'neetcode' ? (
      <Code2 className="h-4 w-4" />
    ) : kind === 'euler' ? (
      <Sigma className="h-4 w-4" />
    ) : kind === 'roadmap' ? (
      <MapPin className="h-4 w-4" />
    ) : (
      <Check className="h-4 w-4" />
    );

  const leetcodeDailys = (board?.dailys ?? []).filter((d) => ['potd', 'random', 'quest', 'studyplan'].includes(d.kind));
  const neetcodeDailys = (board?.dailys ?? []).filter((d) => d.kind === 'neetcode');
  const eulerDailys = (board?.dailys ?? []).filter((d) => d.kind === 'euler');
  const habitDailys = (board?.dailys ?? []).filter((d) => d.kind === 'custom' || d.kind === 'roadmap');

  const activeRoadmaps = useMemo(() => {
    const lastTouched = new Map<string, { topic: string; at: string }>();
    for (const e of activity) {
      if (!e?.slug || lastTouched.has(e.slug)) continue;
      lastTouched.set(e.slug, { topic: e.label || e.slug, at: e.at });
    }

    // In-progress: either some done topics (but not all) or some learning topics
    let inProgress = roadmaps.filter(
      (r) =>
        ((r.doneCount || 0) > 0 || (r.learningCount || 0) > 0) &&
        (r.doneCount || 0) < (r.nodeCount || 0)
    );

    // If none are partially done, but we have touched roadmaps in activity
    if (!inProgress.length) {
      inProgress = roadmaps.filter((r) => lastTouched.has(r.slug));
    }
    // If still none, check any roadmap with doneCount > 0
    if (!inProgress.length) {
      inProgress = roadmaps.filter((r) => (r.doneCount || 0) > 0);
    }

    return inProgress
      .map((r) => {
        const touched = lastTouched.get(r.slug);
        const pct = r.nodeCount ? Math.round(((r.doneCount || 0) / r.nodeCount) * 100) : 0;
        return {
          ...r,
          pct,
          lastTopic: touched?.topic,
          lastAt: touched?.at,
        };
      })
      .sort((a, b) => {
        if (a.lastAt && b.lastAt) return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
        if (a.lastAt) return -1;
        if (b.lastAt) return 1;
        return (b.doneCount || 0) - (a.doneCount || 0);
      });
  }, [roadmaps, activity]);

  const renderCard = (d: DailyCard) => {
    const p = d.problem ?? null;
    const diff = p?.difficulty ?? null;
    const running = timerTask === d.id;

    return (
      <article
        key={d.id}
        className="flex flex-col rounded-xl p-4"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: `1px solid ${d.doneToday ? 'var(--theme-done)' : 'var(--theme-border)'}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
              style={{
                backgroundColor: d.doneToday ? 'var(--theme-done-soft)' : 'var(--theme-surface-2)',
                color: d.doneToday ? 'var(--theme-done)' : 'var(--theme-text-muted)',
              }}
            >
              {kindIcon(d.kind)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="t-small font-medium" style={{ color: 'var(--theme-text)' }}>
                  {d.title}
                </h3>
                {diff && (
                  <span
                    className="t-label rounded px-1.5 py-px"
                    style={{ color: DIFFICULTY_COLOR[diff] ?? 'var(--theme-text-muted)' }}
                  >
                    {diff}
                  </span>
                )}
                {d.kind === 'quest' && d.quest?.difficulty && (
                  <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
                    target {d.quest.difficulty}
                  </span>
                )}
              </div>
              {p?.title ? (
                <p className="t-micro mt-0.5 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                  {p.frontendId ? `${p.frontendId}. ` : ''}
                  {p.title}
                </p>
              ) : (
                <p className="t-micro mt-0.5" style={{ color: 'var(--theme-text-faint)' }}>
                  {d.description}
                </p>
              )}
            </div>
          </div>
          {busy === d.id && (
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin"
              style={{ color: 'var(--theme-text-faint)' }}
            />
          )}
        </div>

        {/* Analytics */}
        {p && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {p.acceptanceRate != null && (
              <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                  {p.acceptanceRate}%
                </span>{' '}
                accept
              </span>
            )}
            {p.likes != null && (
              <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                  {p.likes}
                </span>{' '}
                likes
              </span>
            )}
            {p.totalSubmission != null && (
              <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                  {p.totalSubmission.toLocaleString()}
                </span>{' '}
                subs
              </span>
            )}
            {d.completion?.solveSeconds != null && (
              <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                solved in{' '}
                <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                  {fmtDuration(d.completion.solveSeconds)}
                </span>
              </span>
            )}
          </div>
        )}

        {p?.isQuest && (
          <div className="mt-3 space-y-2.5">
            {p.activeUnit && (
              <div
                className="rounded-lg p-2.5 border"
                style={{
                  backgroundColor: 'var(--theme-surface-2)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold" style={{ color: 'var(--theme-text)' }}>
                    Current Unit: {p.activeUnit.name}
                  </span>
                  <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--theme-primary)' }}>
                    Level {p.activeUnit.currentLevel} / {p.activeUnit.total}
                  </span>
                </div>
                <div className="w-full bg-[var(--theme-border)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--theme-primary)] transition-all rounded-full"
                    style={{
                      width: `${Math.round((p.activeUnit.completed / p.activeUnit.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {p?.topicTags && p.topicTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {p.topicTags.slice(0, 6).map((t) => (
              <span
                key={t}
                className="t-micro rounded px-1.5 py-px"
                style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-text-muted)' }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {p?.notes?.map((n) => (
          <p key={n} className="t-micro mt-2" style={{ color: 'var(--theme-due)' }}>
            {n}
          </p>
        ))}

        {/* Study Plan extra info */}
        {d.kind === 'studyplan' && p?.planName && (
          <div
            className="mt-3 rounded-lg p-2.5 border"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{p.planIcon || '📚'}</span>
                <span className="font-semibold truncate" style={{ color: 'var(--theme-text)' }}>
                  {p.planName}
                </span>
              </div>
              {p.totalProblems && (
                <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: 'var(--theme-primary)' }}>
                  Problem {p.planIndex || (p.completedCount != null ? p.completedCount + 1 : 1)} / {p.totalProblems}
                </span>
              )}
            </div>
            {p.groupName && (
              <div className="t-micro truncate mb-1.5" style={{ color: 'var(--theme-text-muted)' }}>
                Topic: <span className="font-medium" style={{ color: 'var(--theme-text)' }}>{p.groupName}</span>
              </div>
            )}
            {p.totalProblems && (
              <div className="w-full bg-[var(--theme-border)] h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--theme-primary)] transition-all rounded-full"
                  style={{
                    width: `${Math.round(((p.completedCount || 0) / p.totalProblems) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* NeetCode extra info */}
        {d.kind === 'neetcode' && (
          <div
            className="mt-3 rounded-lg p-2.5 border flex flex-col gap-1.5"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold truncate" style={{ color: 'var(--theme-text)' }}>
                {p?.pattern || 'NeetCode All'}{p?.sectionName ? ` · ${p.sectionName}` : ''}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {p?.isBlind75 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-warning-soft)', color: 'var(--theme-warning)' }}>
                    Blind 75
                  </span>
                )}
                {p?.isNc150 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-primary-soft)', color: 'var(--theme-primary)' }}>
                    NC 150
                  </span>
                )}
                {p?.isMl && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-accent-soft)', color: 'var(--theme-accent)' }}>
                    ML
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {d.kind === 'euler' && (
          <div
            className="mt-3 rounded-lg p-2.5 border flex flex-col gap-1.5"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold truncate" style={{ color: 'var(--theme-text)' }}>
                Project Euler · Sequential Challenge
              </span>
              {p?.solvedBy != null && (
                <span className="text-[10px] font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                  {p.solvedBy.toLocaleString()} solvers
                </span>
              )}
            </div>
            {p?.content && (
              <div
                className="text-[11px] leading-relaxed line-clamp-3 text-muted max-h-16 overflow-hidden"
                dangerouslySetInnerHTML={{ __html: p.content }}
              />
            )}
          </div>
        )}

        {(d.kind === 'potd' || d.kind === 'random' || d.kind === 'quest' || d.kind === 'studyplan' || d.kind === 'neetcode' || d.kind === 'euler') && (p?.slug || p?.questSlug || p?.code || p?.eulerId) && (
          <LeetCodeRatingSlider
            slug={p.slug || p.questSlug || p.code || `euler-${p.eulerId}`}
            title={p.title || undefined}
            difficulty={p.difficulty || 'Medium'}
            initialRating={ratings[p.slug || p.questSlug || p.code || `euler-${p.eulerId}`]?.rating}
            onRate={(val) => setRatings((prev) => ({ ...prev, [p.slug || p.questSlug || p.code || `euler-${p.eulerId}`]: { rating: val } }))}
          />
        )}

        {/* Actions */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {running && (
            <span className="tnum t-micro font-mono" style={{ color: 'var(--theme-text)' }}>
              {fmtDuration(elapsed)}
            </span>
          )}
          {!d.doneToday && !running && (
            <button
              type="button"
              onClick={() => startTimer(d.id)}
              className="t-micro rounded-lg px-2.5 py-1.5 font-medium transition-colors hover:bg-[var(--theme-hover-bg)]"
              style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
            >
              Start
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (d.kind === 'quest' && p?.questSlug && p?.activeUnit) {
                await api.updateQuestProgress(p.questSlug, p.activeUnit.id, {
                  action: 'increment',
                  levels: 1,
                  maxLevels: p.activeUnit.total,
                });
              }
              if (d.kind === 'studyplan' && p?.planSlug && p?.slug) {
                await api.markStudyPlanProblem(p.planSlug, p.slug, true);
              }
              if (d.kind === 'neetcode' && (p?.code || p?.slug)) {
                await api.markNeetcodeProblem(p.code || p.slug!, true);
              }
              if (d.kind === 'euler' && p?.eulerId) {
                await api.markEulerProblem(p.eulerId, true);
              }
              await submit(d.id, 'accepted');
            }}
            className="t-micro rounded-lg px-2.5 py-1.5 font-medium transition-colors"
            style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-ink)' }}
          >
            Solved
          </button>
          <button
            type="button"
            onClick={() => submit(d.id, 'attempted')}
            className="t-micro rounded-lg px-2.5 py-1.5 font-medium transition-colors hover:bg-[var(--theme-hover-bg)]"
            style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text-muted)' }}
          >
            Attempted
          </button>
          {d.kind !== 'custom' && (p?.slug || p?.questUrl || p?.neetcodeUrl || p?.leetcodeUrl || p?.url) && (
            <>
              {(p?.url || p?.leetcodeUrl || p?.questUrl || p?.slug || p?.neetcodeUrl) && (
                <a
                  href={p.url || p.leetcodeUrl || p.questUrl || (p?.slug ? `https://leetcode.com/problems/${p.slug}/` : p?.neetcodeUrl || '#')}
                  target="_blank"
                  rel="noreferrer"
                  className="t-micro flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--theme-hover-bg)]"
                  style={{ color: 'var(--theme-text-muted)' }}
                  title={d.kind === 'euler' ? "Open on Project Euler" : "Open Problem"}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {(p?.video || p?.title || p?.slug) && (
                <a
                  href={
                    p?.video ||
                    (d.kind === 'euler'
                      ? `https://www.youtube.com/results?search_query=${encodeURIComponent('Project Euler Problem ' + (p?.eulerId || '') + ' solution')}`
                      : `https://www.youtube.com/results?search_query=${encodeURIComponent('LeetCode ' + (p?.frontendId ? p.frontendId + ' ' : '') + (p?.title || p?.slug) + ' solution')}`)
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-icon btn-xs"
                  title="Watch video explanation"
                  aria-label="Watch video explanation on YouTube"
                >
                  <Video className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </>
          )}
          {(d.kind === 'random' || d.kind === 'quest' || d.kind === 'studyplan' || d.kind === 'neetcode' || d.kind === 'euler') && (
            <button
              type="button"
              onClick={() => reroll(d.id)}
              className="btn btn-ghost btn-sm"
              title="Get a different problem"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
          {d.doneToday && (
            <button
              type="button"
              onClick={() => clear(d.id)}
              className="t-micro ml-auto rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--theme-hover-bg)]"
              style={{ color: 'var(--theme-text-faint)' }}
              title="Undo today"
            >
              Undo
            </button>
          )}
          {d.kind === 'custom' && (
            <button
              type="button"
              onClick={() => removeDaily(d.id)}
              className="t-micro ml-auto rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--theme-hover-bg)]"
              style={{ color: 'var(--theme-text-faint)' }}
              title="Delete this daily"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </article>
    );
  };

  const grid = (rows: DailyCard[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(renderCard)}</div>
  );

  // The board is the first thing fetched and everything below depends on it, so
  // until it lands the page renders in its final shape rather than empty.
  const loading = !board && !error;

  return (
    <div className="page">
      <header className="page-head">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="t-display page-title">
              Dailys
            </h1>
            <p className="t-body page-lede">
              Recurring tasks that reset every day. Track attempts, solve times and streaks.
            </p>
          </div>
          {board && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-right">
                <div
                  className="tnum font-mono text-[26px] font-medium leading-none"
                  style={{ color: 'var(--theme-text)' }}
                >
                  {board.summary.done}
                  <span style={{ color: 'var(--theme-text-faint)' }}>/{board.summary.total}</span>
                </div>
                <div className="t-label mt-1" style={{ color: 'var(--theme-text-faint)' }}>
                  done today
                </div>
              </div>
              <button
                type="button"
                onClick={handleSyncCalendar}
                disabled={calendarSyncing}
                className="btn btn-quiet btn-sm"
                title="Schedules today's tasks into free slots in your Google Calendar with 10-minute alerts"
              >
                {calendarSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--theme-accent)' }} aria-hidden="true" />
                )}
                <span>Sync to Google Calendar</span>
              </button>
            </div>
          )}
        </div>

        {calendarMsg && (
          <div
            className="mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium"
            style={{
              backgroundColor:
                calendarMsg.type === 'ok' ? 'var(--theme-done-soft)' : 'var(--theme-danger-soft)',
              color: calendarMsg.type === 'ok' ? 'var(--theme-done)' : 'var(--theme-danger)',
              border: `1px solid color-mix(in oklab, ${
                calendarMsg.type === 'ok' ? 'var(--theme-done)' : 'var(--theme-danger)'
              } 35%, transparent)`,
            }}
            role="status"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{calendarMsg.text}</span>
          </div>
        )}
      </header>

      {loading ? (
        <>
          <LoadingAnnouncer label="Loading today's board" />
          <SkeletonMetrics cells={6} className="mb-8" />
          <SkeletonCards count={3} className="mb-8" />
          <SkeletonCards count={6} />
        </>
      ) : (
        <>
      {error && (
        <div
          className="mb-6 flex items-start gap-2.5 rounded-xl px-4 py-3"
          style={{
            backgroundColor: 'var(--theme-danger-soft)',
            color: 'var(--theme-danger)',
            border: '1px solid var(--theme-danger)',
          }}
          role="alert"
        >
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="t-small">{error}</span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <section className="mb-8">
          <div
            className="metric-strip grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            {[
              { label: 'Current streak', value: `${stats.currentStreak}d`, icon: <Flame className="h-3.5 w-3.5" /> },
              { label: 'Longest streak', value: `${stats.longestStreak}d`, icon: <Trophy className="h-3.5 w-3.5" /> },
              { label: 'Solved / attempts', value: `${stats.totalSolved}/${stats.totalAttempts}`, icon: <Check className="h-3.5 w-3.5" /> },
              { label: 'Completion', value: `${stats.completionRate}%`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
              { label: 'Avg solve', value: fmtDuration(stats.avgSolveSeconds), icon: <Clock className="h-3.5 w-3.5" /> },
              { label: 'Active days', value: String(stats.activeDays), icon: <ScrollText className="h-3.5 w-3.5" /> },
            ].map((s) => (
              <div key={s.label} className="metric px-4 py-3.5">
                <div className="t-label flex items-center gap-1.5" style={{ color: 'var(--theme-text-faint)' }}>
                  <span aria-hidden="true">{s.icon}</span>
                  {s.label}
                </div>
                <div className="tnum mt-1.5 font-mono text-[19px] font-medium" style={{ color: 'var(--theme-text)' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
                Last 30 days
              </span>
              <Trend points={stats.trend} />
            </div>
            {Object.entries(stats.byDifficulty).length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {Object.entries(stats.byDifficulty)
                  .filter(([d]) => ['Easy', 'Medium', 'Hard'].includes(d))
                  .sort(([a], [b]) => {
                    const order: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
                    return (order[a] || 9) - (order[b] || 9);
                  })
                  .map(([d, v]) => (
                  <span key={d} className="flex items-baseline gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: DIFFICULTY_COLOR[d] ?? 'var(--theme-text-faint)' }}
                    />
                    <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                      {d}
                    </span>
                    <span className="tnum t-micro font-mono" style={{ color: 'var(--theme-text)' }}>
                      {v.solved}/{v.attempts}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {cache && (
              <span className="t-micro ml-auto" style={{ color: 'var(--theme-text-faint)' }}>
                {cache.problemCount.toLocaleString()} problems cached
                {cache.problemsetAgeHours != null && ` · ${cache.problemsetAgeHours}h old`}
              </span>
            )}
          </div>
        </section>
      )}

      {/* Roadmap: your curriculum track in progress to continue */}
      <Section
        title="Roadmap"
        count={activeRoadmaps.length}
        hint="Pick up where you left off. Continue your active roadmap curriculum."
        action={
          <Link
            to="/"
            className="btn btn-quiet btn-sm"
            style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          >
            <Compass className="h-3 w-3" />
            All roadmaps
          </Link>
        }
      >
        {activeRoadmaps.length === 0 ? (
          <EmptyState
            compact
            icon={<Compass className="h-5 w-5" />}
            title="No roadmap in progress"
            description="Your active curriculum shows up here so you can continue it in one click. Open any roadmap and mark a topic to start."
            action={
              <Link to="/" className="btn btn-primary btn-sm">
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                Browse roadmaps
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeRoadmaps.slice(0, 3).map((rm, idx) => (
              <article
                key={rm.slug}
                className="flex flex-col justify-between rounded-xl p-4 transition-all"
                style={{
                  backgroundColor: 'var(--theme-surface)',
                  border: idx === 0 ? '1px solid var(--theme-primary)' : '1px solid var(--theme-border)',
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                        style={{
                          backgroundColor: idx === 0 ? 'var(--theme-primary-soft)' : 'var(--theme-surface-2)',
                          color: idx === 0 ? 'var(--theme-primary)' : 'var(--theme-text-muted)',
                        }}
                      >
                        <Compass className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="t-small font-medium truncate" style={{ color: 'var(--theme-text)' }}>
                            {rm.title}
                          </h3>
                        </div>
                        {rm.lastTopic ? (
                          <p className="t-micro mt-0.5 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                            Last touched: <span style={{ color: 'var(--theme-text)' }}>{rm.lastTopic}</span>
                            {rm.lastAt && ` · ${timeAgo(rm.lastAt)}`}
                          </p>
                        ) : (
                          <p className="t-micro mt-0.5" style={{ color: 'var(--theme-text-faint)' }}>
                            {rm.nodeCount} total topics
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="tnum font-mono text-sm font-semibold shrink-0" style={{ color: 'var(--theme-text)' }}>
                      {rm.pct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3.5 w-full rounded-full h-1.5" style={{ backgroundColor: 'var(--theme-border)' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${rm.pct}%`,
                        backgroundColor: rm.pct === 100 ? 'var(--theme-done)' : 'var(--theme-primary)',
                      }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--theme-text-faint)' }}>
                    <span>{rm.doneCount} / {rm.nodeCount} done</span>
                    {rm.learningCount ? <span>{rm.learningCount} learning</span> : null}
                  </div>
                </div>

                {/* Continue Action */}
                <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--theme-border)' }}>
                  <span className="t-micro truncate" style={{ color: 'var(--theme-text-faint)' }}>
                    {idx === 0 ? 'Current active' : 'In progress'}
                  </span>
                  <Link
                    to={`/roadmap/${encodeURIComponent(rm.slug)}`}
                    className="t-small inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all hover:opacity-90 cursor-pointer shrink-0"
                    style={{
                      backgroundColor: 'var(--theme-primary)',
                      color: 'var(--theme-primary-ink)',
                    }}
                  >
                    <span>Continue</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      {/* LeetCode: potd / random / quest. Never mixed with custom habits —
          these are network-backed and resolve a real problem each day. */}
      <Section
        title="LeetCode"
        count={leetcodeDailys.length}
        hint="Problem of the Day, random problems and quests. Each one resolves a real LeetCode problem and links straight to it. Your profile analytics live on the Dashboard."
      >
        {leetcodeDailys.length === 0 ? (
          <EmptyState
            compact
            icon={<Code2 className="h-5 w-5" />}
            title="No LeetCode dailys enabled"
            description="Add the daily problem, a random problem, or a difficulty-targeted quest. Each one resolves a real LeetCode problem and links straight to it."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setNewKind('potd');
                  setAdding(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Enable Problem of the Day
              </button>
            }
          />
        ) : (
          grid(leetcodeDailys)
        )}
      </Section>

      {/* NeetCode: daily challenge from NeetCode All (Free) */}
      <Section
        title="NeetCode"
        count={neetcodeDailys.length}
        hint="Daily problems from NeetCode All (Free only). Complete solutions with YouTube video explanations and local progress tracking."
      >
        {neetcodeDailys.length === 0 ? (
          <EmptyState
            compact
            icon={<Target className="h-5 w-5" />}
            title="No NeetCode dailys enabled"
            description="Add a daily problem from NeetCode All (Free). Solutions come with a video explanation and track progress locally."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setNewKind('neetcode');
                  setAdding(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Enable NeetCode daily
              </button>
            }
          />
        ) : (
          grid(neetcodeDailys)
        )}
      </Section>

      {/* Project Euler: sequential daily mathematical challenges */}
      <Section
        title="Project Euler"
        count={eulerDailys.length}
        hint="Sequential challenges (#1 today, #2 tomorrow, etc.) from Project Euler with full offline backup."
      >
        {eulerDailys.length === 0 ? (
          <EmptyState
            compact
            icon={<Sigma className="h-5 w-5" />}
            title="No Project Euler dailys enabled"
            description="Sequential mathematical challenges — #1 today, #2 tomorrow — with a full offline backup of the problem set."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setNewKind('euler');
                  setAdding(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Enable Project Euler daily
              </button>
            }
          />
        ) : (
          grid(eulerDailys)
        )}
      </Section>

      {/* Habits: the user's own recurring tasks. No network, no problem
          resolution — just a checkbox that resets at midnight. */}
      <Section
        title="Habits"
        count={habitDailys.length}
        hint="Your own recurring tasks. Nothing here touches the network."
        action={
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn btn-quiet btn-sm"
            style={{ border: '1px solid var(--theme-border)', color: 'var(--theme-text)' }}
          >
            <Plus className="h-3 w-3" />
            Add daily
          </button>
        }
      >
        {adding && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl p-3"
            style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addDaily();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder="Daily title…"
              className="field min-w-[12rem] flex-1"
              aria-label="Title for the new daily"
            />
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as typeof newKind)}
              className="field w-auto"
              aria-label="Type of daily to add"
            >
              <option value="custom">Habit</option>
              <option value="potd">Problem of the Day</option>
              <option value="random">Random problem</option>
              <option value="quest">Quest</option>
              <option value="neetcode">NeetCode problem</option>
              <option value="euler">Project Euler problem</option>
            </select>
            {newKind === 'quest' && (
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value)}
                className="field w-auto"
                aria-label="Target difficulty for the quest"
              >
                {['Easy', 'Medium', 'Hard'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void addDaily()}
              disabled={busy === 'add'}
              className="btn btn-primary btn-sm"
            >
              {busy === 'add' ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        )}
        {habitDailys.length === 0 ? (
          <EmptyState
            compact
            icon={<Check className="h-5 w-5" />}
            title="No habits yet"
            description="Habits are your own recurring tasks — nothing here touches the network. Add one and it resets at midnight."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add your first habit
              </button>
            }
          />
        ) : (
          grid(habitDailys)
        )}
      </Section>

      {/* History */}
      <section>
        <h2 className="t-heading mb-2" style={{ color: 'var(--theme-text)' }}>
          History
          {historyTotal > 0 && (
            <span className="tnum ml-2 font-mono text-[12px]" style={{ color: 'var(--theme-text-faint)' }}>
              {historyTotal}
            </span>
          )}
        </h2>
        <div
          className="overflow-hidden rounded-xl"
          style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
        >
          {history.length === 0 ? (
            <div className="px-5 py-6">
              <p className="t-small text-center" style={{ color: 'var(--theme-text-faint)' }}>
                No attempts recorded yet. Solve a daily and it will be logged here with its
                outcome and solve time.
              </p>
            </div>
          ) : (
            history.map((r, i) => (
              <div
                key={`${r.at}-${i}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5"
                style={i ? { borderTop: '1px solid var(--theme-border)' } : undefined}
              >
                <span className="tnum t-micro font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                  {r.dateKey}
                </span>
                <span className="t-micro" style={{ color: 'var(--theme-text)' }}>
                  {r.taskId}
                </span>
                {r.problem?.title && (
                  <span className="t-micro truncate" style={{ color: 'var(--theme-text-muted)' }}>
                    {r.problem.title}
                  </span>
                )}
                {r.problem?.difficulty && (
                  <span
                    className="t-label rounded px-1.5 py-px"
                    style={{ color: DIFFICULTY_COLOR[r.problem.difficulty] ?? 'var(--theme-text-muted)' }}
                  >
                    {r.problem.difficulty}
                  </span>
                )}
                <span
                  className="t-label ml-auto"
                  style={{
                    color:
                      r.outcome === 'accepted' || r.outcome === 'done'
                        ? 'var(--theme-done)'
                        : 'var(--theme-text-muted)',
                  }}
                >
                  {r.outcome}
                </span>
                {r.seconds != null && (
                  <span className="tnum t-micro font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                    {fmtDuration(r.seconds)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
