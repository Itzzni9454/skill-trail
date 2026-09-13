import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Calendar,
  Shield,
  Download,
  Upload,
  Target,
  Check,
  TrendingUp,
  Clock,
  ArrowRight,
  ExternalLink,
  Flame,
  Loader2,
  Trophy,
  Compass,
  Sparkles,
  Plus,
  Minus,
  CheckCircle,
  Code2,
  Star,
  Video,
  Sigma,
  ChevronLeft,
  ChevronRight,
  Award,
  Coins,
  Heart,
  Zap,
  TriangleAlert,
} from 'lucide-react';
import {
  api,
  type ActivityEvent,
  type LeetCodeProfile,
  type QuestTrack,
  type NeetcodePatternGroup,
  type EulerProblem,
  type EulerCacheStatus,
  type HabiticaProfile,
  type HabiticaTask,
  type CalendarStatus,
} from '../lib/api';
import ConnectorsPanel from '../components/ConnectorsPanel';
import StudyStreaks from '../components/StudyStreaks';
import ReviewQueue from '../components/ReviewQueue';
import BadgeModal from '../components/BadgeModal';
import CareerGapModal from '../components/CareerGapModal';
import EmptyState from '../components/EmptyState';
import { SkeletonCards, SkeletonMetrics, LoadingAnnouncer } from '../components/Skeleton';

type Stats = Awaited<ReturnType<typeof api.getStats>>;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function EventRow({ ev }: { ev: ActivityEvent }) {
  if (ev.type === 'node-status') {
    const verb =
      ev.to === 'done' ? 'marked done' : ev.to === 'learning' ? 'started learning' : ev.to === 'skipped' ? 'skipped' : 'reset';
    return (
      <Link
        to={`/roadmap/${encodeURIComponent(ev.slug || '')}?node=${encodeURIComponent(ev.nodeId || '')}`}
        className="flex items-center gap-3 px-5 py-2.5 hover:opacity-80 transition-opacity text-sm min-w-0"
        style={{ color: 'var(--theme-text)' }}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${ev.to === 'done' ? 'bg-done' : ev.to === 'learning' ? 'bg-learning' : 'bg-active'}`} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{ev.label || ev.nodeId}</span> — {verb}
        </span>
        <span className="ml-auto text-xs shrink-0" style={{ color: 'var(--theme-text-muted)' }}>{timeAgo(ev.at)}</span>
      </Link>
    );
  }
  if (ev.type === 'backup-restore') {
    return (
      <div className="flex items-center gap-3 px-5 py-2.5 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
        <span className="w-2 h-2 rounded-full bg-due" />
        Backup restored ({ev.mode})
        <span className="ml-auto text-xs">{timeAgo(ev.at)}</span>
      </div>
    );
  }
  if (ev.type === 'reset') {
    return (
      <div className="flex items-center gap-3 px-5 py-2.5 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
        <span className="w-2 h-2 rounded-full bg-danger" />
        Progress reset
        <span className="ml-auto text-xs">{timeAgo(ev.at)}</span>
      </div>
    );
  }
  return null;
}

function ActivityTimeline() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    api.getActivity(20).then((r) => setEvents(r.events)).catch(() => {});
  }, []);
  const visible = events.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div
      className="rounded-2xl border divide-y mb-8 overflow-hidden shadow-sm"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {visible.map((ev, i) => <EventRow key={i} ev={ev} />)}
    </div>
  );
}

function HabiticaDashboardCard() {
  const [profile, setProfile] = useState<HabiticaProfile | null>(null);
  const [tasks, setTasks] = useState<HabiticaTask[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.getHabiticaProfile().catch(() => null),
      api.getHabiticaTasks().catch(() => []),
    ]).then(([prof, tList]) => {
      if (prof) setProfile(prof);
      if (Array.isArray(tList)) setTasks(tList);
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncDailies = async () => {
    try {
      setSyncing(true);
      const res = await api.syncHabiticaDailies();
      const count = (res.created?.length ?? 0) + (res.matched?.length ?? 0);
      setSyncMessage(`Synced ${count || 7} default dailies with Habitica`);
      loadData();
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleToggleDaily = async (task: HabiticaTask) => {
    const taskId = task.id || task._id;
    if (!taskId || togglingId) return;
    setTogglingId(taskId);
    try {
      const dir = task.completed ? 'down' : 'up';
      await api.scoreHabiticaTask(taskId, dir);
      setTasks((prev) =>
        prev.map((t) => ((t.id === taskId || t._id === taskId) ? { ...t, completed: !t.completed } : t))
      );
      api.getHabiticaProfile().then((p) => p && setProfile(p)).catch(() => {});
    } catch (err: any) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  const dailies = tasks.filter((t) => t.type === 'daily');
  const completedCount = dailies.filter((t) => t.completed).length;

  return (
    <div
      className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-rpg/10 text-rpg flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--theme-text)' }}>
              <span>Habitica RPG & Dailies</span>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                  profile && !profile.error
                    ? 'bg-done-soft text-done border-done/30'
                    : 'bg-active/10 text-ink-muted border-line-strong/20'
                }`}
              >
                {profile && !profile.error ? `Lvl ${profile.lvl || 1} ${profile.class || 'Warrior'}` : 'Habitica RPG'}
              </span>
              {profile?.username && (
                <span className="text-xs font-normal" style={{ color: 'var(--theme-text-muted)' }}>
                  @{profile.username}
                </span>
              )}
            </div>
            <div className="text-xs mt-0.5 max-w-xl truncate" style={{ color: 'var(--theme-text-muted)' }}>
              {profile?.error ? (
                <span className="text-danger">{profile.error}</span>
              ) : (
                'Two-way gamified daily habit & roadmap study tracker'
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncDailies}
            disabled={syncing}
            className="px-3.5 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            title="Ensure 7 core daily tasks are synchronized in Habitica"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Sync 7 Dailies'}</span>
          </button>
          <Link
            to="/habitica"
            className="px-4 py-2 rounded-full text-xs font-semibold bg-rpg text-[var(--theme-primary-ink)] hover:opacity-90 transition-all cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95"
          >
            <span>Open Micro-Habitica</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {syncMessage && (
        <div className="mb-4 text-xs font-medium flex items-center gap-1.5 px-3 py-2 rounded-xl bg-done-soft text-done border border-done/20">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {profile && !profile.error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div
            className="p-3 rounded-xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-hp">
                <Heart className="w-3.5 h-3.5 fill-hp" /> HP
              </span>
              <span className="font-mono font-medium text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                {profile.hp ?? 50} / {profile.maxHealth ?? 50}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--theme-border)] overflow-hidden">
              <div
                className="h-full bg-hp rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, ((profile.hp ?? 50) / (profile.maxHealth ?? 50)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div
            className="p-3 rounded-xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-mp">
                <Zap className="w-3.5 h-3.5 fill-mp" /> MP
              </span>
              <span className="font-mono font-medium text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                {profile.mp ?? 10} / {profile.maxMP ?? 10}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--theme-border)] overflow-hidden">
              <div
                className="h-full bg-mp rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, ((profile.mp ?? 10) / (profile.maxMP ?? 10)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div
            className="p-3 rounded-xl border flex flex-col justify-between"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold flex items-center gap-1.5 text-exp">
                <Star className="w-3.5 h-3.5 fill-exp" /> EXP
              </span>
              <span className="font-mono font-medium text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
                {profile.exp ?? 0} / {profile.toNextLevel ?? 100}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--theme-border)] overflow-hidden">
              <div
                className="h-full bg-exp rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(0, ((profile.exp ?? 0) / (profile.toNextLevel ?? 100)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <div
            className="p-3 rounded-xl border flex items-center justify-between"
            style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                  Gold
                </div>
                <div className="font-bold text-sm font-mono text-gold">
                  {(profile.gp ?? 0).toLocaleString()} GP
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
                Dailies
              </div>
              <div className="text-xs font-bold font-mono" style={{ color: 'var(--theme-text)' }}>
                {completedCount}/{dailies.length}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--theme-text-muted)' }}>
            Active Dailies ({completedCount}/{dailies.length} done today)
          </span>
          <Link to="/habitica" className="text-xs font-medium text-rpg hover:underline">
            Manage All Tasks →
          </Link>
        </div>

        {dailies.length === 0 ? (
          <div
            className="py-6 px-4 rounded-xl border border-dashed text-center text-xs"
            style={{
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text-muted)',
              backgroundColor: 'var(--theme-surface-2)',
            }}
          >
            No dailies loaded yet. Click <span className="font-semibold text-rpg">"Sync 7 Dailies"</span> above to load your Leetcode, Neetcode, Euler & Roadmap dailies.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {dailies.map((daily) => {
              const dId = daily.id || daily._id || '';
              const isDone = Boolean(daily.completed);
              const isBusy = togglingId === dId;
              return (
                <div
                  key={dId}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isDone}
                  aria-label={`${isDone ? 'Mark not done' : 'Mark done'}: ${daily.text}`}
                  aria-busy={isBusy}
                  onClick={() => !isBusy && handleToggleDaily(daily)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!isBusy) handleToggleDaily(daily);
                    }
                  }}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                    isDone
                      ? 'bg-done-soft/40 border-done/30 text-done'
                      : 'hover:bg-[var(--theme-surface-2)]'
                  }`}
                  style={!isDone ? { backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' } : undefined}
                >
                  {/* Visual checkbox only — the row above is the control, so this
                      must not be a second tab stop. */}
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      isDone
                        ? 'bg-done border-done on-accent'
                        : 'border-line-strong hover:border-line text-transparent'
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3 h-3 animate-spin text-current" />
                    ) : (
                      <Check className="w-3 h-3 stroke-[3]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-medium truncate ${isDone ? 'line-through opacity-75' : ''}`}>
                      {daily.text}
                    </div>
                    {daily.streak !== undefined && daily.streak > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-exp font-semibold mt-0.5">
                        <Flame className="w-2.5 h-2.5 fill-exp" />
                        <span>{daily.streak} streak</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleCalendarCard() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api.getCalendarStatus().then(setStatus).catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSyncFreeSlots = async () => {
    try {
      setSyncing(true);
      setResultMsg(null);
      const res = await api.syncCalendarFreeSlots();
      setResultMsg(
        `Scheduled ${res.scheduled?.length ?? 0} daily study tasks into free slots on ${res.calendarId || 'Google Calendar'} (10m phone alerts active)`
      );
      loadStatus();
    } catch (err: any) {
      setResultMsg(`Calendar sync error: ${err.message || 'Failed'}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setResultMsg(null), 6000);
    }
  };

  const freeSlots = status?.freeSlots || [];

  return (
    <div
      className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-mp/10 text-mp flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--theme-text)' }}>
              <span>Google Calendar Smart Scheduler</span>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                  status?.connected ? 'bg-done-soft text-done border-done/30' : 'bg-active/10 text-ink-muted border-line-strong/20'
                }`}
              >
                {status?.connected ? 'Connected' : 'Active'}
              </span>
            </div>
            <div className="text-xs mt-0.5 max-w-xl truncate" style={{ color: 'var(--theme-text-muted)' }}>
              Connected to <span className="font-semibold text-mp">{status?.calendarId || 'your calendar'}</span> · Auto-schedules dailies into open gaps with 10-min phone alerts
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFreeSlots}
            disabled={syncing}
            className="px-4 py-2 rounded-full text-xs font-semibold bg-mp text-[var(--theme-primary-ink)] hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Finding Free Slots…' : 'Sync Free Slots to Calendar'}</span>
          </button>
        </div>
      </div>

      {resultMsg && (
        <div className="mb-4 text-xs font-medium flex items-center gap-1.5 px-3 py-2 rounded-xl bg-done-soft text-done border border-done/20">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{resultMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className="p-3.5 rounded-xl border"
          style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: 'var(--theme-text)' }}>
            <Clock className="w-3.5 h-3.5 text-mp" />
            <span>Free Slots Today</span>
          </div>
          <div className="text-xl font-bold font-mono text-mp">
            {status?.freeSlotsCount ?? 0} slots
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Available between 09:00 - 22:00
          </div>
        </div>

        <div
          className="p-3.5 rounded-xl border"
          style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: 'var(--theme-text)' }}>
            <Target className="w-3.5 h-3.5 text-exp" />
            <span>Active Dailies</span>
          </div>
          <div className="text-xl font-bold font-mono text-exp">
            7 tasks
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Leetcode, Neetcode, Euler & Roadmap
          </div>
        </div>

        <div
          className="p-3.5 rounded-xl border"
          style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold mb-1" style={{ color: 'var(--theme-text)' }}>
            <Sparkles className="w-3.5 h-3.5 text-done" />
            <span>Phone Reminders</span>
          </div>
          <div className="text-xl font-bold font-mono text-done">
            10 min
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Pop-up alert before each task
          </div>
        </div>
      </div>

      {freeSlots.length > 0 && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--theme-text-muted)' }}>
            Today's Open Time Slots
          </div>
          <div className="flex flex-wrap gap-2">
            {freeSlots.map((slot, idx) => {
              const startT = new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const endT = new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  key={idx}
                  className="px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <Clock className="w-3 h-3 text-mp" />
                  <span>{startT} – {endT}</span>
                  <span className="text-[10px] px-1 py-0.2 rounded bg-mp/10 text-mp font-semibold">
                    {slot.durationMinutes}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function VelocityBurnDownCard({ stats }: { stats: Stats }) {
  const [targetPace, setTargetPace] = useState<'auto' | 'casual' | 'dedicated' | 'intense'>('auto');
  const [historicalVelocity, setHistoricalVelocity] = useState(5);

  useEffect(() => {
    api.getActivity(100).then((res) => {
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 86400000;
      const recentDone = (res.events || []).filter(
        (e) => e.type === 'node-status' && e.to === 'done' && new Date(e.at).getTime() >= sevenDaysAgo,
      ).length;
      setHistoricalVelocity(Math.max(1, recentDone || 4));
    }).catch(() => {});
  }, []);

  const velocity =
    targetPace === 'casual'
      ? 3
      : targetPace === 'dedicated'
      ? 7
      : targetPace === 'intense'
      ? 14
      : historicalVelocity;

  const remaining = Math.max(0, (stats.totalNodes || 0) - (stats.totalDone || 0));
  const daysRemaining = Math.round((remaining / velocity) * 7);

  /**
   * A linear forecast over thousands of remaining topics produces dates
   * centuries out ("25 Mar 2174"), which is worse than useless. Once the
   * projection stops being meaningful, report a horizon instead of a date.
   */
  const horizon = useMemo(() => {
    if (remaining === 0) {
      return { value: 'Complete', detail: 'every topic is marked done' };
    }
    const years = daysRemaining / 365;
    if (years >= 20) {
      return {
        value: '20+ years',
        detail: `${remaining.toLocaleString()} topics left at this pace`,
      };
    }
    if (years >= 1) {
      const y = Math.floor(years);
      const m = Math.round((years - y) * 12);
      return {
        value: m ? `${y} yr ${m} mo` : `${y} yr`,
        detail: `~${daysRemaining.toLocaleString()} days at this pace`,
      };
    }
    const d = new Date();
    d.setDate(d.getDate() + daysRemaining);
    return {
      value: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      detail: `~${daysRemaining.toLocaleString()} days at this pace`,
    };
  }, [remaining, daysRemaining]);

  const pct = stats.totalNodes ? Math.round((stats.totalDone / stats.totalNodes) * 100) : 0;

  return (
    <div
      className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-learning-soft text-learning flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-learning" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--theme-text)' }}>
              <span>Study Velocity & Burn-Down Forecast</span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-learning-soft text-learning border border-learning/30">
                {velocity} topics/wk
              </span>
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
              Projected completion timeline based on your learning speed.
            </p>
          </div>
        </div>

        {/* Pace selector pills */}
        <div
          className="flex items-center gap-1 p-1 rounded-full text-xs font-semibold border max-w-full overflow-x-auto scrollbar-none"
          style={{
            backgroundColor: 'var(--theme-surface-soft)',
            borderColor: 'var(--theme-border)',
          }}
        >
          {(
            [
              ['auto', `Auto (${historicalVelocity}/wk)`],
              ['casual', 'Casual (3/wk)'],
              ['dedicated', 'Dedicated (7/wk)'],
              ['intense', 'Intense (14/wk)'],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setTargetPace(p)}
              className="px-3 py-1 rounded-full transition-all cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: targetPace === p ? 'var(--theme-surface)' : 'transparent',
                color: targetPace === p ? 'var(--theme-text)' : 'var(--theme-text-muted)',
                boxShadow: targetPace === p ? 'var(--theme-shadow)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Burn-down summary grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-surface-2)', border: '1px solid var(--theme-border)' }}>
          <div className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            Projected horizon
          </div>
          <div className="tnum mt-1.5 font-mono text-[19px] font-medium" style={{ color: 'var(--theme-text)' }}>
            {horizon.value}
          </div>
          <div className="t-micro mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            {horizon.detail}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-surface-2)', border: '1px solid var(--theme-border)' }}>
          <div className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            Remaining to burn
          </div>
          <div className="tnum mt-1.5 font-mono text-[19px] font-medium" style={{ color: 'var(--theme-text)' }}>
            {remaining.toLocaleString()}
          </div>
          <div className="t-micro mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            {stats.totalDone.toLocaleString()} mastered of {stats.totalNodes.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--theme-surface-2)', border: '1px solid var(--theme-border)' }}>
          <div className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            Burn-down trajectory
          </div>
          <div className="tnum mt-1.5 font-mono text-[19px] font-medium" style={{ color: 'var(--theme-text)' }}>
            {pct}%
          </div>
          <div
            className="mt-2 h-1 overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--theme-border)' }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: 'var(--theme-primary)',
                transitionTimingFunction: 'var(--ease-out)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CareerRoleBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="rounded-2xl p-6 mb-8 flex items-center justify-between gap-4 flex-wrap shadow-sm border transition-all"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="w-12 h-12 rounded-2xl bg-accent-soft border border-accent/20 flex items-center justify-center shrink-0">
          <Target className="w-6 h-6 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-base flex items-center gap-2 flex-wrap" style={{ color: 'var(--theme-text)' }}>
            <span>Career Role Gap Analysis & Competency Matrix</span>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/30 font-semibold">
              Industry Match
            </span>
          </div>
          <div className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
            Evaluate your completed skills against Senior Frontend, Backend Architect, DevOps, Fullstack, and AI Engineer hiring expectations.
          </div>
        </div>
      </div>
      <button
        onClick={onOpen}
        className="w-full sm:w-auto px-5 py-2.5 rounded-full text-xs font-bold bg-accent hover:bg-accent on-accent transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
      >
        <span>Inspect Career Fit</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BackupControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [badgeOpen, setBadgeOpen] = useState(false);

  async function download() {
    try {
      const data = await api.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roadmap-offline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: 'Backup downloaded.' });
    } catch {
      setMsg({ ok: false, text: 'Export failed — is the server running?' });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const mode = window.confirm(
        'OK = MERGE into existing progress (recommended)\nCancel = REPLACE everything (wipes current progress first)',
      )
        ? 'merge'
        : 'replace';
      await api.restoreBackup({ ...parsed, mode });
      setMsg({ ok: true, text: `Backup restored (${mode}). Reloading…` });
      setTimeout(() => window.location.reload(), 800);
      return;
    } catch {
      setMsg({ ok: false, text: 'Restore failed — invalid file or server error.' });
    }
    setTimeout(() => setMsg(null), 4000);
  }

  return (
    <div
      className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
            <Download className="w-4 h-4 text-learning shrink-0" />
            <span>Progress Backup & Integrations</span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
            Includes progress, personal notes, custom roadmaps, embeddable GitHub badges, and iCalendar feed.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <a
            href="/api/calendar.ics"
            download="roadmap-reviews.ics"
            className="px-4 py-2 rounded-full text-xs font-semibold border transition-all inline-flex items-center gap-1.5 shadow-2xs active:scale-95"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            title="Download iCalendar feed for Google Calendar, Apple Calendar, or Outlook"
          >
            <Calendar className="w-3.5 h-3.5 text-learning shrink-0" />
            <span>iCal Feed (.ics)</span>
          </a>
          <button
            className="px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-primary)',
              color: 'var(--theme-primary-ink)',
            }}
            onClick={() => setBadgeOpen(true)}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>GitHub Badge & Anki</span>
          </button>
          <button
            className="px-4 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            onClick={download}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Export Backup</span>
          </button>
          <button
            className="px-4 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>Restore Backup</span>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Restore a backup file" onChange={onFile} />
        </div>
      </div>
      {msg && (
        <div className={`mt-3 text-xs font-semibold ${msg.ok ? 'text-done' : 'text-danger'}`}>{msg.text}</div>
      )}

      <BadgeModal
        isOpen={badgeOpen}
        onClose={() => setBadgeOpen(false)}
        slug="frontend"
        title="Developer Progress"
      />
    </div>
  );
}

/**
 * Toggle for the "covered" setting: whether topics done in another roadmap
 * count toward done-stats. Persisted server-side; onChange reloads stats.
 */
function CoveredSetting({ onChange }: { onChange: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setEnabled(s.countCoveredAsDone))
      .catch(() => setEnabled(true));
  }, []);

  async function toggle() {
    if (enabled === null || busy) return;
    setBusy(true);
    const next = !enabled;
    try {
      await api.setCountCovered(next);
      setEnabled(next);
      onChange();
    } catch {
      /* leave as-is on failure */
    }
    setBusy(false);
  }

  return (
    <label
      className="inline-flex items-center gap-2 text-sm cursor-pointer select-none mb-6"
      style={{ color: 'var(--theme-text-muted)' }}
      title="Topics you completed in any roadmap automatically count as done in other roadmaps that share them"
    >
      <input
        type="checkbox"
        className="w-4 h-4 accent-[var(--theme-primary)]"
        checked={enabled ?? true}
        disabled={enabled === null || busy}
        onChange={toggle}
      />
      Count topics done in other roadmaps toward progress
      {enabled === null && (
        <span
          className="skeleton skeleton-line inline-block align-middle"
          style={{ width: '3.5rem', height: '0.7rem' }}
          aria-hidden="true"
        />
      )}
    </label>
  );
}

/* --------------------------- LeetCode analytics --------------------------- */

const HEATMAP_WEEKS = 26;

/**
 * Contribution heatmap. The calendar only contains days that had a submission,
 * so it can't simply be chunked into sevens — cells are placed on a real
 * Monday-aligned week grid and the gaps are filled with zeroes.
 */
function LeetCodeHeatmap({ days }: { days: { date: string; count: number }[] }) {
  const byDate = new Map(days.map((d) => [d.date, d.count]));
  const max = Math.max(1, ...days.map((d) => d.count));

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (new Date(todayUtc).getUTCDay() + 6) % 7;
  const saturday = todayUtc + (6 - mondayOffset) * 86_400_000;

  const weeks: { date: string; count: number }[][] = [];
  for (let w = HEATMAP_WEEKS - 1; w >= 0; w--) {
    const col: { date: string; count: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const t = new Date(saturday - (w * 7 + (5 - d)) * 86_400_000);
      const iso = t.toISOString().slice(0, 10);
      col.push({ date: iso, count: byDate.get(iso) ?? 0 });
    }
    weeks.push(col);
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1" aria-hidden="true">
      {weeks.map((col, i) => (
        <div key={i} className="flex shrink-0 flex-col gap-[3px]">
          {col.map((c) => (
            <span
              key={c.date}
              className="h-[9px] w-[9px] rounded-xs"
              style={{
                backgroundColor: c.count ? 'var(--theme-primary)' : 'var(--theme-surface-2)',
                opacity: c.count ? 0.3 + 0.7 * Math.min(1, c.count / max) : 1,
              }}
              title={`${c.date}: ${c.count} submission${c.count === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function StatCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ backgroundColor: 'var(--theme-surface-2)', border: '1px solid var(--theme-border)' }}
    >
      <div className="t-label flex items-center gap-1.5" style={{ color: 'var(--theme-text-faint)' }}>
        {icon}
        {label}
      </div>
      <div className="tnum mt-1.5 font-mono text-[19px] font-medium" style={{ color: 'var(--theme-text)' }}>
        {value}
      </div>
    </div>
  );
}

/**
 * Public LeetCode profile analytics. Lives on the Dashboard rather than in
 * Dailys: the dailys are per-day *tasks*, this is a standing *profile*.
 */
function LeetCodePanel() {
  const [data, setData] = useState<LeetCodeProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((username?: string) => {
    setLoading(true);
    return api
      .getLeetCodeProfile(username)
      .then((r) => {
        setData(r);
        setErr(r.error ?? null);
      })
      .catch((e: unknown) => setErr(String((e as Error)?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const u = draft.trim().replace(/^@/, '');
    if (!u) return;
    setSaving(true);
    try {
      await api.setLeetCodeUsername(u);
      setDraft('');
      await load();
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const profile = data?.profile ?? null;
  const solved = profile?.solved;

  return (
    <div className="p-6 transition-all">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-due-soft text-due flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-due" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold flex items-center gap-2 flex-wrap" style={{ color: 'var(--theme-text)' }}>
              <span>LeetCode profile</span>
              {profile?.username && (
                <a
                  href={`https://leetcode.com/u/${encodeURIComponent(profile.username)}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-due-soft text-due border border-due/30 inline-flex items-center gap-1"
                >
                  @{profile.username}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
              {profile
                ? `Solved, acceptance, ranking, contest rating and recent submissions. Updated ${timeAgo(profile.fetchedAt)}.`
                : 'Set your LeetCode handle to pull public stats — no login or session needed.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-2 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 active:scale-95"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            title="Refresh profile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Username form — the handle itself is never written into source. */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          aria-label="LeetCode username"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          placeholder={profile?.username ? 'Change handle…' : 'LeetCode username'}
          spellCheck={false}
          autoComplete="off"
          className="t-small min-w-[12rem] flex-1 rounded-lg px-3 py-2"
          style={{
            backgroundColor: 'var(--theme-surface-2)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text)',
          }}
        />
        <button
          onClick={() => void save()}
          disabled={saving || !draft.trim()}
          className="px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-ink)' }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{data?.configured ? 'Update' : 'Save'}</span>
        </button>
      </div>

      {err && (
        <div className="mb-5 text-xs font-medium flex items-start gap-1.5" style={{ color: 'var(--theme-danger)' }}>
          <span className="mt-px shrink-0">!</span>
          <span>{err}</span>
        </div>
      )}

      {!profile ? (
        loading ? (
          <div className="card p-4">
            <LoadingAnnouncer label="Loading LeetCode profile" />
            <SkeletonCards count={3} height="3.5rem" />
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Code2 className="h-5 w-5" />}
            title="No LeetCode handle set"
            description="Add your LeetCode username above to pull in solved counts, acceptance rate and a difficulty breakdown."
          />
        )
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {profile && solved?.All === 0 && !profile.contest ? (
            <p
              className="t-small flex items-center gap-2 rounded-xl px-4 py-3"
              style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-text-muted)', border: '1px dashed var(--theme-border)' }}
            >
              <span aria-hidden="true">○</span>
              <span>Stats will fill in as you solve problems on LeetCode.</span>
            </p>
          ) : null}

            <StatCell label="Solved" value={String(solved?.All ?? '—')} icon={<Check className="h-3.5 w-3.5" />} />
            <StatCell label="Easy" value={String(solved?.Easy ?? '—')} icon={<span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-done)' }} />} />
            <StatCell label="Medium" value={String(solved?.Medium ?? '—')} icon={<span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-due)' }} />} />
            <StatCell label="Hard" value={String(solved?.Hard ?? '—')} icon={<span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--theme-danger)' }} />} />
            <StatCell
              label="Acceptance"
              value={profile.acceptanceRate != null ? `${profile.acceptanceRate}%` : 'No submissions'}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <StatCell
              label="Ranking"
              value={profile.ranking != null ? `#${profile.ranking.toLocaleString()}` : '—'}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCell
              label="Current streak"
              value={profile.streak != null ? `${profile.streak}d` : '—'}
              icon={<Flame className="h-3.5 w-3.5" />}
            />
            <StatCell
              label="Active days"
              value={profile.totalActiveDays != null ? String(profile.totalActiveDays) : '—'}
              icon={<Check className="h-3.5 w-3.5" />}
            />
            <StatCell
              label="Contest rating"
              value={profile.contest?.rating != null ? String(profile.contest.rating) : '—'}
              icon={<Trophy className="h-3.5 w-3.5" />}
            />
          </div>

          {profile.contest && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {profile.contest.globalRanking != null && (
                <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                  global{' '}
                  <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                    #{profile.contest.globalRanking.toLocaleString()}
                  </span>
                </span>
              )}
              {profile.contest.attended != null && (
                <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                  contests{' '}
                  <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                    {profile.contest.attended}
                  </span>
                </span>
              )}
              {profile.contest.topPercentage != null && (
                <span className="t-micro" style={{ color: 'var(--theme-text-muted)' }}>
                  top{' '}
                  <span className="tnum font-mono" style={{ color: 'var(--theme-text)' }}>
                    {Math.round(profile.contest.topPercentage)}%
                  </span>
                </span>
              )}
            </div>
          )}

          {profile.calendar.length > 0 && (
            <div>
              <div className="t-label mb-2" style={{ color: 'var(--theme-text-faint)' }}>
                Submission activity · last {HEATMAP_WEEKS} weeks
              </div>
              <LeetCodeHeatmap days={profile.calendar} />
            </div>
          )}

          {profile.languages.length > 0 && (
            <div>
              <div className="t-label mb-2" style={{ color: 'var(--theme-text-faint)' }}>
                Languages
              </div>
              <div className="space-y-1.5">
                {profile.languages.slice(0, 6).map((l) => {
                  const top = profile.languages[0]?.problemsSolved || 1;
                  return (
                    <div key={l.languageName} className="flex items-center gap-3">
                      <span className="t-micro w-24 shrink-0 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                        {l.languageName}
                      </span>
                      <span
                        className="h-1.5 flex-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: 'var(--theme-border)' }}
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.round((l.problemsSolved / top) * 100)}%`,
                            backgroundColor: 'var(--theme-primary)',
                          }}
                        />
                      </span>
                      <span className="tnum t-micro w-10 shrink-0 text-right font-mono" style={{ color: 'var(--theme-text)' }}>
                        {l.problemsSolved}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {profile.tags.length > 0 && (
            <div>
              <div className="t-label mb-2" style={{ color: 'var(--theme-text-faint)' }}>
                Top topics
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.tags.map((t) => (
                  <span
                    key={t.tagName}
                    className="t-micro rounded px-2 py-0.5"
                    style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-text-muted)' }}
                  >
                    {t.tagName}{' '}
                    <span className="tnum font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                      {t.problemsSolved}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.recent.length > 0 && (
            <div>
              <div className="t-label mb-2" style={{ color: 'var(--theme-text-faint)' }}>
                Recent accepted
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {profile.recent.slice(0, 8).map((r) => (
                  <a
                    key={`${r.slug}-${r.at}`}
                    href={`https://leetcode.com/problems/${r.slug}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-baseline gap-3 py-1.5 hover:opacity-80 transition-opacity"
                  >
                    <span className="t-micro min-w-0 flex-1 truncate" style={{ color: 'var(--theme-text)' }}>
                      {r.title}
                    </span>
                    <span className="t-micro shrink-0" style={{ color: 'var(--theme-text-faint)' }}>
                      {timeAgo(r.at)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LeetCodeQuestsTracker() {
  const [quests, setQuests] = useState<QuestTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>('data-structures-and-algorithms-quest');

  const loadQuests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getLeetCodeQuests();
      setQuests(res.quests || []);
    } catch (e) {
      console.error('Failed to load quests:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuests();
  }, [loadQuests]);

  const activeQuest = quests.find((q) => q.slug === selectedSlug) || quests[0] || null;

  const suggestedQuest = useMemo(() => {
    if (!quests.length) return null;
    const incomplete = quests.filter((q) => !q.isCompleted);
    return incomplete[0] || quests[0];
  }, [quests]);

  const handleUpdate = async (
    slug: string,
    unitId: string,
    action: 'increment' | 'decrement' | 'complete_unit' | 'reset',
    maxLevels: number,
  ) => {
    setUpdating(unitId);
    try {
      const res = await api.updateQuestProgress(slug, unitId, {
        action,
        levels: 1,
        maxLevels,
      });
      if (res.allQuests) {
        setQuests(res.allQuests);
      } else {
        await loadQuests();
      }
    } catch (err) {
      console.error('Failed to update quest level:', err);
    } finally {
      setUpdating(null);
    }
  };

  if (loading && quests.length === 0) {
    return (
      <div className="card mb-8 p-5">
        <LoadingAnnouncer label="Loading LeetCode quests" />
        <SkeletonCards count={3} height="4.5rem" />
      </div>
    );
  }

  const totalAllLevels = quests.reduce((acc, q) => acc + q.totalLevels, 0);
  const completedAllLevels = quests.reduce((acc, q) => acc + q.completedLevels, 0);
  const overallPercent = totalAllLevels > 0 ? Math.round((completedAllLevels / totalAllLevels) * 100) : 0;

  return (
    <div className="p-6 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-due-soft text-due flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-due" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base" style={{ color: 'var(--theme-text)' }}>
                LeetCode Quests & Mastery Tracks
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-due-soft text-due border border-due/30">
                1-on-1 Flow · Local Progress
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
              Track all 4 official LeetCode Quests and 25 units. Mark levels complete locally without needing cookies or login.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-mono font-bold" style={{ color: 'var(--theme-text)' }}>
              {completedAllLevels}/{totalAllLevels} levels
            </div>
            <div className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
              {overallPercent}% completed overall
            </div>
          </div>
          <button
            onClick={() => void loadQuests()}
            disabled={loading}
            className="p-2 rounded-full border transition-all cursor-pointer shadow-2xs flex items-center justify-center active:scale-95"
            style={{
              backgroundColor: 'var(--theme-surface)',
              borderColor: 'var(--theme-border-strong)',
              color: 'var(--theme-text)',
            }}
            title="Refresh quests"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Suggested Quest Recommendation Card */}
      {suggestedQuest && !suggestedQuest.isCompleted && suggestedQuest.activeUnit && (
        <div
          className="rounded-xl border p-4 mb-6 relative overflow-hidden flex flex-wrap items-center justify-between gap-4"
          style={{
            backgroundColor: 'var(--theme-surface-2)',
            borderColor: 'var(--theme-primary)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[var(--theme-primary-soft)] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-[var(--theme-primary)]">
                  Next Suggested Challenge
                </span>
                <span className="text-[10px] rounded px-1.5 py-0.2 bg-[var(--theme-border)] text-[var(--theme-text-muted)] font-mono">
                  {suggestedQuest.name}
                </span>
              </div>
              <div className="text-sm font-semibold truncate mt-0.5" style={{ color: 'var(--theme-text)' }}>
                {suggestedQuest.activeUnit.name} · Level {suggestedQuest.activeUnit.currentLevel} of {suggestedQuest.activeUnit.total}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://leetcode.com/quest/${suggestedQuest.slug}/`}
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
              style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-ink)' }}
            >
              <span>Play on LeetCode</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              onClick={() =>
                handleUpdate(
                  suggestedQuest.slug,
                  suggestedQuest.activeUnit!.id,
                  'increment',
                  suggestedQuest.activeUnit!.total,
                )
              }
              disabled={updating === suggestedQuest.activeUnit.id}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition-all cursor-pointer hover:opacity-80"
              style={{
                borderColor: 'var(--theme-done)',
                backgroundColor: 'var(--theme-done-soft)',
                color: 'var(--theme-done)',
              }}
              title="Report progress (+1 Level)"
            >
              <Plus className="w-3 h-3" />
              <span>+1 Level</span>
            </button>
          </div>
        </div>
      )}

      {/* Quest Track Selector Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-6">
        {quests.map((q) => {
          const isSelected = q.slug === selectedSlug;
          return (
            <button
              key={q.slug}
              onClick={() => setSelectedSlug(q.slug)}
              className="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 relative overflow-hidden"
              style={{
                backgroundColor: isSelected ? 'var(--theme-surface-2)' : 'var(--theme-surface)',
                borderColor: isSelected ? 'var(--theme-primary)' : 'var(--theme-border)',
                boxShadow: isSelected ? '0 0 0 1px var(--theme-primary)' : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {q.icon ? (
                    <img src={q.icon} alt="" className="w-6 h-6 rounded-md object-contain shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-due-soft text-due flex items-center justify-center shrink-0 font-bold text-xs">
                      Q
                    </div>
                  )}
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--theme-text)' }}>
                    {q.name}
                  </span>
                </div>
                {q.isCompleted && (
                  <CheckCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-done)' }} />
                )}
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                  <span>{q.completedLevels}/{q.totalLevels} levels</span>
                  <span>{q.percent}%</span>
                </div>
                <div className="w-full bg-[var(--theme-border)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${q.percent}%`,
                      backgroundColor: q.isCompleted ? 'var(--theme-done)' : 'var(--theme-primary)',
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Quest Flow Details */}
      {activeQuest && (
        <div
          className="rounded-xl border p-5"
          style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}
        >
          {/* Active Quest Header */}
          <div
            className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b"
            style={{ borderColor: 'var(--theme-border)' }}
          >
            <div className="flex items-center gap-3">
              {activeQuest.icon && (
                <img src={activeQuest.icon} alt="" className="w-10 h-10 rounded-xl object-contain shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--theme-text)' }}>
                  <span>{activeQuest.name}</span>
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--theme-surface)] text-[var(--theme-text-muted)] border"
                    style={{ borderColor: 'var(--theme-border)' }}
                  >
                    {activeQuest.units.length} Units · {activeQuest.totalLevels} Levels
                  </span>
                </h4>
                <div className="text-xs mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                  {activeQuest.completedUnits}/{activeQuest.totalUnits} units completed ({activeQuest.completedLevels}/{activeQuest.totalLevels} levels)
                </div>
              </div>
            </div>

            <a
              href={`https://leetcode.com/quest/${activeQuest.slug}/`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              style={{
                backgroundColor: 'var(--theme-surface)',
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
              }}
            >
              <span>Open on LeetCode</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Unit Flow Map */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {activeQuest.units.map((unit, idx) => {
              const isDone = unit.completed >= unit.total;
              const isActive = unit.status === 'active';
              return (
                <div
                  key={unit.id}
                  className="rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-all relative"
                  style={{
                    backgroundColor: 'var(--theme-surface)',
                    borderColor: isDone
                      ? 'var(--theme-done)'
                      : isActive
                      ? 'var(--theme-primary)'
                      : 'var(--theme-border)',
                    boxShadow: isActive ? '0 0 0 1px var(--theme-primary)' : undefined,
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    {unit.icon ? (
                      <img
                        src={unit.icon}
                        alt=""
                        className="w-9 h-9 rounded-lg object-contain shrink-0 p-0.5 bg-[var(--theme-surface-2)]"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-[var(--theme-surface-2)] flex items-center justify-center font-mono font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--theme-text-faint)' }}>
                          Unit #{idx + 1}
                        </span>
                        <span
                          className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded"
                          style={{
                            backgroundColor: isDone
                              ? 'var(--theme-done-soft)'
                              : isActive
                              ? 'var(--theme-primary-soft)'
                              : 'var(--theme-surface-2)',
                            color: isDone
                              ? 'var(--theme-done)'
                              : isActive
                              ? 'var(--theme-primary)'
                              : 'var(--theme-text-muted)',
                          }}
                        >
                          {isDone ? 'Completed' : isActive ? 'Active' : 'Locked'}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold truncate mt-0.5" style={{ color: 'var(--theme-text)' }} title={unit.name}>
                        {unit.name}
                      </h5>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-mono mb-1" style={{ color: 'var(--theme-text-muted)' }}>
                      <span>Level {unit.completed}/{unit.total}</span>
                      <span>{Math.round((unit.completed / unit.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-[var(--theme-surface-2)] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round((unit.completed / unit.total) * 100)}%`,
                          backgroundColor: isDone ? 'var(--theme-done)' : 'var(--theme-primary)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Level Controls */}
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-[var(--theme-border)] text-xs">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUpdate(activeQuest.slug, unit.id, 'increment', unit.total)}
                        disabled={isDone || updating === unit.id}
                        className="px-2 py-1 rounded text-[11px] font-bold transition-all disabled:opacity-30 cursor-pointer flex items-center gap-0.5"
                        style={{
                          backgroundColor: 'var(--theme-primary-soft)',
                          color: 'var(--theme-primary)',
                        }}
                        title="Increment completed level (+1)"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Level</span>
                      </button>
                      {unit.completed > 0 && (
                        <button
                          onClick={() => handleUpdate(activeQuest.slug, unit.id, 'decrement', unit.total)}
                          disabled={updating === unit.id}
                          className="px-1.5 py-1 rounded text-[11px] font-bold transition-all hover:bg-[var(--theme-hover-bg)] cursor-pointer"
                          style={{ color: 'var(--theme-text-faint)' }}
                          title="Decrement level (-1)"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        handleUpdate(
                          activeQuest.slug,
                          unit.id,
                          isDone ? 'reset' : 'complete_unit',
                          unit.total,
                        )
                      }
                      disabled={updating === unit.id}
                      className="text-[10px] font-semibold px-2 py-1 rounded transition-all hover:opacity-80 cursor-pointer"
                      style={{
                        backgroundColor: isDone ? 'var(--theme-surface-2)' : 'var(--theme-done-soft)',
                        color: isDone ? 'var(--theme-text-muted)' : 'var(--theme-done)',
                      }}
                    >
                      {isDone ? 'Reset' : 'Complete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}




function RatedProblemCard({ slug, data, onUpdate }: { slug: string; data: any; onUpdate: () => void }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(data.notes || '');
  const [saving, setSaving] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    await api.rateLeetCodeProblem(slug, undefined, undefined, undefined, undefined, undefined, notes);
    setEditingNotes(false);
    setSaving(false);
    onUpdate();
  };

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl border"
      style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-surface-2)' }}
    >
      <div className="flex justify-between items-start gap-2">
        <a href={`https://leetcode.com/problems/${slug}/`} target="_blank" rel="noreferrer" className="font-semibold text-sm truncate hover:underline" style={{ color: 'var(--theme-text)' }}>
          {data.title || slug}
        </a>
        <span className="font-mono font-bold text-xs" style={{ color: 'var(--theme-primary)' }}>{data.rating}/10</span>
      </div>
      <div className="text-[11px] flex flex-wrap gap-2">
        <span style={{ color: 'var(--theme-text-muted)' }}>
          {data.difficulty}
          {data.solved ? ' · Solved' : ' · Attempted'}
        </span>
        <span style={{ color: 'var(--theme-text-faint)' }}>
          {data.attempts} attempts · {Math.round(data.averageTimePerAttempt || 0)}s avg
        </span>
      </div>

      {editingNotes ? (
        <div className="flex flex-col gap-1 mt-1">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="field resize-y"
            rows={2}
            placeholder="Add notes for this problem…"
            aria-label="Notes for this problem"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setEditingNotes(false); setNotes(data.notes || ''); }} className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: 'var(--theme-surface)', color: 'var(--theme-text-muted)' }}>Cancel</button>
            <button onClick={saveNotes} disabled={saving} className="text-[10px] px-2 py-1 rounded font-medium" style={{ backgroundColor: 'var(--theme-primary)', color: 'var(--theme-primary-ink)' }}>Save</button>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 rounded"
          role="button"
          tabIndex={0}
          aria-label={data.notes ? 'Edit notes' : 'Add notes'}
          onClick={() => setEditingNotes(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditingNotes(true);
            }
          }}
        >
          {data.notes ? (
            <p className="text-xs cursor-pointer hover:opacity-80 line-clamp-3 whitespace-pre-wrap" style={{ color: 'var(--theme-text-muted)' }}>{data.notes}</p>
          ) : (
            <span className="text-[10px] cursor-pointer hover:underline italic" style={{ color: 'var(--theme-text-faint)' }}>+ Add notes</span>
          )}
        </div>
      )}
    </div>
  )
}

export function LeetCodeRatedProblems() {
  const [ratings, setRatings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  
  const [sortField, setSortField] = useState<'rating' | 'date' | 'time'>('rating');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [groupBy, setGroupBy] = useState<'none' | 'difficulty'>('none');

  const load = () => {
    api.getLeetCodeRatings().then(r => setRatings(r.ratings || {})).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  let entries = Object.entries(ratings);

  if (filterDifficulty !== 'All') {
    entries = entries.filter(([_, data]) => data.difficulty === filterDifficulty);
  }
  if (filterStatus !== 'All') {
    entries = entries.filter(([_, data]) => filterStatus === 'Solved' ? data.solved : !data.solved);
  }

  entries.sort((a, b) => {
    if (sortField === 'rating') return b[1].rating - a[1].rating;
    if (sortField === 'time') return (b[1].averageTimePerAttempt || 0) - (a[1].averageTimePerAttempt || 0);
    return new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime();
  });

  if (loading)
    return (
      <div className="p-1">
        <SkeletonCards count={6} height="6rem" />
      </div>
    );

  const renderGrid = (list: typeof entries) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map(([slug, data]) => (
        <RatedProblemCard key={slug} slug={slug} data={data} onUpdate={load} />
      ))}
    </div>
  );

  return (
    <div className="p-6 pt-2">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select aria-label="Sort rated problems by" value={sortField} onChange={e => setSortField(e.target.value as any)} className="t-micro rounded px-2 py-1 border bg-transparent" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
          <option value="rating">Sort by Rating</option>
          <option value="date">Sort by Recent</option>
          <option value="time">Sort by Avg Time</option>
        </select>
        <select aria-label="Filter rated problems by difficulty" value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="t-micro rounded px-2 py-1 border bg-transparent" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
          <option value="All">All Difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
        <select aria-label="Filter rated problems by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="t-micro rounded px-2 py-1 border bg-transparent" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
          <option value="All">All Status</option>
          <option value="Solved">Solved</option>
          <option value="Attempted">Attempted</option>
        </select>
        <select aria-label="Group rated problems by" value={groupBy} onChange={e => setGroupBy(e.target.value as any)} className="t-micro rounded px-2 py-1 border bg-transparent" style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}>
          <option value="none">Don't Group</option>
          <option value="difficulty">Group by Difficulty</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="t-small" style={{ color: 'var(--theme-text-muted)' }}>No problems match the current filters.</div>
      ) : groupBy === 'none' ? (
        renderGrid(entries)
      ) : (
        <div className="space-y-6">
          {['Easy', 'Medium', 'Hard'].map(diff => {
            const groupEntries = entries.filter(([_, data]) => {
              const d = data.difficulty === 'Easy' || data.difficulty === 'Hard' ? data.difficulty : 'Medium';
              return d === diff;
            });
            if (!groupEntries.length) return null;
            return (
              <div key={diff}>
                <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--theme-text)' }}>{diff}</h3>
                {renderGrid(groupEntries)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========================= STUDY PLANS TRACKER ============================ */

const DIFFICULTY_COLOR_SP: Record<string, string> = {
  Easy: 'var(--theme-done)',
  Medium: 'var(--theme-due)',
  Hard: 'var(--theme-danger)',
};

function StudyPlansTracker() {
  const [plans, setPlans] = useState<import('../lib/api').StudyPlanDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getStudyPlans();
      setPlans((res.plans || []) as import('../lib/api').StudyPlanDetail[]);
    } catch (e) {
      console.error('Failed to load study plans:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleProblem = async (planSlug: string, problemSlug: string, currentDone: boolean) => {
    const key = `${planSlug}|${problemSlug}`;
    setToggling(key);
    try {
      await api.markStudyPlanProblem(planSlug, problemSlug, !currentDone);
      setPlans((prev) =>
        prev.map((plan) => {
          if (plan.slug !== planSlug) return plan;
          const completedProblems = currentDone
            ? (plan.completedProblems || []).filter((s) => s !== problemSlug)
            : [...(plan.completedProblems || []), problemSlug];
          const completedCount = completedProblems.length;
          return {
            ...plan,
            completedProblems,
            completedCount,
            isCompleted: completedCount >= plan.totalProblems,
            groups: plan.groups?.map((g) => ({
              ...g,
              problems: g.problems.map((p) =>
                p.slug === problemSlug ? { ...p, done: !currentDone } : p
              ),
              completedCount: g.problems.filter((p) =>
                p.slug === problemSlug ? !currentDone : p.done
              ).length,
            })) || [],
          };
        })
      );
    } catch (e) {
      console.error('Failed to toggle problem:', e);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="card p-5">
        <SkeletonCards count={3} height="5rem" />
      </div>
    );
  }

  const totalProblems = plans.reduce((s, p) => s + (p.totalProblems || 0), 0);
  const totalCompleted = plans.reduce((s, p) => s + (p.completedCount || 0), 0);
  const overallPct = totalProblems > 0 ? Math.round((totalCompleted / totalProblems) * 100) : 0;

  return (
    <div className="p-6 pt-2">
      {/* Overall summary */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>
            {totalCompleted} / {totalProblems} problems completed
          </div>
          <div className="t-micro mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
            Across 11 free study plans · Local progress
          </div>
        </div>
        <div className="text-right">
          <div className="tnum font-mono font-bold text-2xl" style={{ color: 'var(--theme-primary)' }}>{overallPct}%</div>
        </div>
      </div>
      <div className="w-full rounded-full h-1.5 mb-6" style={{ backgroundColor: 'var(--theme-border)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${overallPct}%`, backgroundColor: 'var(--theme-primary)' }} />
      </div>

      {/* Plan list */}
      <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
        {plans.map((plan) => {
          const pct = plan.totalProblems > 0
            ? Math.round(((plan.completedCount || 0) / plan.totalProblems) * 100) : 0;
          const isOpen = expanded === plan.slug;

          return (
            <div key={plan.slug}>
              {/* Plan header */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : plan.slug)}
                className="w-full flex items-center gap-3 py-3.5 text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="text-xl shrink-0">{plan.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>{plan.name}</span>
                    {plan.isCompleted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--theme-done-soft)', color: 'var(--theme-done)' }}>✓ Done</span>
                    )}
                    {plan.error && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--theme-danger-soft)', color: 'var(--theme-danger)' }}>Unavailable</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 rounded-full h-1" style={{ backgroundColor: 'var(--theme-border)' }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--theme-done)' : 'var(--theme-primary)' }} />
                    </div>
                    <span className="tnum text-[11px] font-mono shrink-0" style={{ color: 'var(--theme-text-faint)' }}>
                      {plan.completedCount || 0}/{plan.totalProblems}
                    </span>
                  </div>
                </div>
                <a
                  href={`https://leetcode.com/studyplan/${plan.slug}/`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--theme-hover-bg)] transition-colors"
                  title="Open on LeetCode"
                >
                  <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-faint)' }} />
                </a>
                {isOpen
                  ? <Minus className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-text-muted)' }} />
                  : <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--theme-text-muted)' }} />
                }
              </button>

              {/* Expanded: topic groups */}
              {isOpen && plan.groups && (
                <div className="pb-4 pl-8">
                  {plan.groups.map((group) => {
                    const gKey = `${plan.slug}|${group.slug}`;
                    const gOpen = expandedGroup === gKey;
                    return (
                      <div key={group.slug} className="mb-2">
                        <button
                          type="button"
                          onClick={() => setExpandedGroup(gOpen ? null : gKey)}
                          className="w-full flex items-center gap-2 py-2 text-left cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className="font-semibold text-xs flex-1" style={{ color: 'var(--theme-text)' }}>
                            {group.name}
                          </span>
                          <span className="tnum text-[10px] font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                            {group.completedCount}/{group.problems.length}
                          </span>
                          {gOpen
                            ? <Minus className="w-3 h-3" style={{ color: 'var(--theme-text-faint)' }} />
                            : <Plus className="w-3 h-3" style={{ color: 'var(--theme-text-faint)' }} />
                          }
                        </button>
                        {gOpen && (
                          <div className="space-y-1 pl-1">
                            {group.problems.map((prob) => {
                              const tKey = `${plan.slug}|${prob.slug}`;
                              const isToggling = toggling === tKey;
                              return (
                                <div key={prob.slug} className="flex items-center gap-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleProblem(plan.slug, prob.slug, !!prob.done)}
                                    disabled={isToggling}
                                    className="w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all"
                                    style={{
                                      borderColor: prob.done ? 'var(--theme-done)' : 'var(--theme-border-strong)',
                                      backgroundColor: prob.done ? 'var(--theme-done)' : 'transparent',
                                    }}
                                  >
                                    {prob.done && <Check className="w-2.5 h-2.5 on-accent" />}
                                  </button>
                                  <a
                                    href={`https://leetcode.com/problems/${prob.slug}/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 text-xs truncate hover:underline"
                                    style={{
                                      color: prob.done ? 'var(--theme-text-faint)' : 'var(--theme-text)',
                                      textDecoration: prob.done ? 'line-through' : 'none',
                                    }}
                                  >
                                    {prob.title}
                                  </a>
                                  <span
                                    className="text-[10px] font-semibold shrink-0"
                                    style={{ color: DIFFICULTY_COLOR_SP[prob.difficulty] || 'var(--theme-text-muted)' }}
                                  >
                                    {prob.difficulty}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeetCodeSection() {
  const [openSection, setOpenSection] = useState<'profile' | 'quests' | 'studyplans' | 'ratings'>('profile');

  return (
    <div className="rounded-2xl border mb-8 shadow-sm transition-all overflow-hidden" style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}>
      {/* Profile Toggle */}
      <button type="button" onClick={() => setOpenSection(openSection === 'profile' ? null as any : 'profile')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer">
         <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
            <Trophy className="w-5 h-5 text-due" />
            LeetCode Profile Stats
         </div>
         {openSection === 'profile' ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
      </button>
      {openSection === 'profile' && <LeetCodePanel />}

      {/* Quests Toggle */}
      <div className="border-t" style={{ borderColor: 'var(--theme-border)' }} />
      <button type="button" onClick={() => setOpenSection(openSection === 'quests' ? null as any : 'quests')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer">
         <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
            <Compass className="w-5 h-5 text-accent" />
            LeetCode Quests Tracker
         </div>
         {openSection === 'quests' ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
      </button>
      {openSection === 'quests' && <LeetCodeQuestsTracker />}

      {/* Study Plans Toggle */}
      <div className="border-t" style={{ borderColor: 'var(--theme-border)' }} />
      <button type="button" onClick={() => setOpenSection(openSection === 'studyplans' ? null as any : 'studyplans')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer">
         <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
            <span className="text-xl">📚</span>
            Study Plans Tracker
         </div>
         {openSection === 'studyplans' ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
      </button>
      {openSection === 'studyplans' && <StudyPlansTracker />}

      {/* Ratings Toggle */}
      <div className="border-t" style={{ borderColor: 'var(--theme-border)' }} />
      <button type="button" onClick={() => setOpenSection(openSection === 'ratings' ? null as any : 'ratings')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer">
         <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
            <Star className="w-5 h-5 text-warning" />
            My Rated Problems
         </div>
         {openSection === 'ratings' ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
      </button>
      {openSection === 'ratings' && <LeetCodeRatedProblems />}
    </div>
  );
}

function NeetCodeSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<NeetcodePatternGroup[]>([]);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Todo' | 'Done'>('All');
  const [listFilter, setListFilter] = useState<'All' | 'NC150' | 'Blind75' | 'NC250' | 'ML'>('All');
  const [togglingCode, setTogglingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getNeetcodeProblems();
      setGroups(res.groups || []);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePattern = (pattern: string) => {
    setExpandedPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(pattern)) next.delete(pattern);
      else next.add(pattern);
      return next;
    });
  };

  const toggleAllPatterns = (expand: boolean) => {
    if (expand) {
      setExpandedPatterns(new Set(groups.map((g) => g.pattern)));
    } else {
      setExpandedPatterns(new Set());
    }
  };

  const toggleProblem = async (code: string, currentDone: boolean) => {
    setTogglingCode(code);
    try {
      await api.markNeetcodeProblem(code, !currentDone);
      setGroups((prev) =>
        prev.map((g) => {
          let delta = 0;
          const problems = g.problems.map((p) => {
            if (p.code === code) {
              delta = !currentDone ? 1 : -1;
              return { ...p, done: !currentDone };
            }
            return p;
          });
          return {
            ...g,
            problems,
            completedCount: Math.max(0, g.completedCount + delta),
          };
        })
      );
    } catch (e) {
      console.error('Failed to toggle NeetCode problem:', e);
    } finally {
      setTogglingCode(null);
    }
  };

  // Compute stats
  const allProblems = useMemo(() => groups.flatMap((g) => g.problems), [groups]);
  const totalProblems = allProblems.length;
  const totalCompleted = allProblems.filter((p) => p.done).length;
  const pct = totalProblems > 0 ? Math.round((totalCompleted / totalProblems) * 100) : 0;

  const easyTotal = allProblems.filter((p) => p.difficulty === 'Easy').length;
  const easyDone = allProblems.filter((p) => p.difficulty === 'Easy' && p.done).length;

  const medTotal = allProblems.filter((p) => p.difficulty === 'Medium').length;
  const medDone = allProblems.filter((p) => p.difficulty === 'Medium' && p.done).length;

  const hardTotal = allProblems.filter((p) => p.difficulty === 'Hard').length;
  const hardDone = allProblems.filter((p) => p.difficulty === 'Hard' && p.done).length;

  return (
    <div className="rounded-2xl border mb-8 shadow-sm transition-all overflow-hidden" style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
          <Code2 className="w-5 h-5 text-due" />
          NeetCode All (Free) Tracker
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-text-muted)' }}>
            {totalCompleted}/{totalProblems} ({pct}%)
          </span>
          {isOpen ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
          {loading ? (
            <SkeletonCards count={3} height="5rem" />
          ) : error ? (
            <div className="text-danger text-xs py-4">{error}</div>
          ) : (
            <>
              {/* Summary Stats Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>
                    {totalCompleted} / {totalProblems} problems solved
                  </div>
                  <div className="t-micro mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                    100% Free problems across 19 categories · Local progress tracking
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="tnum font-mono font-bold text-2xl" style={{ color: 'var(--theme-primary)' }}>
                      {pct}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full rounded-full h-1.5 mb-5" style={{ backgroundColor: 'var(--theme-border)' }}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--theme-done)' : 'var(--theme-primary)' }}
                />
              </div>

              {/* Difficulty breakdown pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-done)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Easy:</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{easyDone}/{easyTotal}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-due)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Medium:</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{medDone}/{medTotal}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-danger)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Hard:</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{hardDone}/{hardTotal}</span>
                </div>
              </div>

              {/* Filter & Controls Bar */}
              <div className="flex flex-wrap items-center gap-2.5 mb-5">
                <div className="relative flex-1 min-w-[160px]">
                  <input
                    type="text"
                    aria-label="Search NeetCode problems"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search NeetCode problems..."
                    className="w-full text-xs rounded-lg px-3 py-1.5 border bg-transparent"
                    style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>

                <select
                  aria-label="Filter by NeetCode list"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value as any)}
                  className="text-xs rounded-lg px-2.5 py-1.5 border bg-transparent"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <option value="All">All Free ({totalProblems})</option>
                  <option value="NC150">NeetCode 150</option>
                  <option value="Blind75">Blind 75</option>
                  <option value="NC250">NeetCode 250</option>
                  <option value="ML">Machine Learning (36)</option>
                </select>

                <select
                  aria-label="Filter by difficulty"
                  value={diffFilter}
                  onChange={(e) => setDiffFilter(e.target.value as any)}
                  className="text-xs rounded-lg px-2.5 py-1.5 border bg-transparent"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <option value="All">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="text-xs rounded-lg px-2.5 py-1.5 border bg-transparent"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <option value="All">All Status</option>
                  <option value="Todo">To Do</option>
                  <option value="Done">Completed</option>
                </select>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => toggleAllPatterns(true)}
                    className="text-[11px] px-2 py-1 rounded hover:opacity-80 cursor-pointer"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Expand all
                  </button>
                  <span style={{ color: 'var(--theme-border)' }}>·</span>
                  <button
                    type="button"
                    onClick={() => toggleAllPatterns(false)}
                    className="text-[11px] px-2 py-1 rounded hover:opacity-80 cursor-pointer"
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              {/* 19 Pattern Categories */}
              <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
                {groups.map((group) => {
                  let filteredProblems = group.problems;
                  if (search.trim()) {
                    const q = search.toLowerCase().trim();
                    filteredProblems = filteredProblems.filter((p) => p.name.toLowerCase().includes(q));
                  }
                  if (diffFilter !== 'All') {
                    filteredProblems = filteredProblems.filter((p) => p.difficulty === diffFilter);
                  }
                  if (statusFilter === 'Todo') {
                    filteredProblems = filteredProblems.filter((p) => !p.done);
                  } else if (statusFilter === 'Done') {
                    filteredProblems = filteredProblems.filter((p) => p.done);
                  }
                  if (listFilter === 'NC150') {
                    filteredProblems = filteredProblems.filter((p) => p.is_nc150);
                  } else if (listFilter === 'Blind75') {
                    filteredProblems = filteredProblems.filter((p) => p.is_blind75);
                  } else if (listFilter === 'NC250') {
                    filteredProblems = filteredProblems.filter((p) => p.is_nc250);
                  } else if (listFilter === 'ML') {
                    filteredProblems = filteredProblems.filter((p) => p.is_ml || p.pattern === 'Machine Learning');
                  }

                  if (filteredProblems.length === 0 && (search || diffFilter !== 'All' || statusFilter !== 'All' || listFilter !== 'All')) {
                    return null;
                  }

                  const isExpanded = expandedPatterns.has(group.pattern) || search.length > 0;
                  const groupPct = group.total > 0 ? Math.round((group.completedCount / group.total) * 100) : 0;

                  return (
                    <div key={group.pattern} className="py-2.5">
                      <button
                        type="button"
                        onClick={() => togglePattern(group.pattern)}
                        className="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="font-semibold text-sm truncate" style={{ color: 'var(--theme-text)' }}>
                            {group.pattern}
                          </span>
                          <span className="text-xs font-mono" style={{ color: 'var(--theme-text-muted)' }}>
                            ({group.completedCount}/{group.total})
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-24 rounded-full h-1.5 overflow-hidden hidden sm:block" style={{ backgroundColor: 'var(--theme-border)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${groupPct}%`, backgroundColor: groupPct === 100 ? 'var(--theme-done)' : 'var(--theme-primary)' }}
                            />
                          </div>
                          {isExpanded ? (
                            <Minus className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                          ) : (
                            <Plus className="w-4 h-4" style={{ color: 'var(--theme-text-muted)' }} />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-1 pl-2 sm:pl-4">
                          {filteredProblems.map((prob) => {
                            const isToggling = togglingCode === prob.code;
                            const ncUrl = prob.nc_link ? `https://neetcode.io/problems/${prob.nc_link}` : 'https://neetcode.io/practice/practice/allNC?access=Free';
                            const lcUrl = prob.link ? `https://leetcode.com/problems/${prob.link}` : null;
                            const ytUrl = prob.video
                              ? `https://www.youtube.com/watch?v=${prob.video}`
                              : `https://www.youtube.com/results?search_query=${encodeURIComponent('NeetCode ' + prob.name + ' solution')}`;

                            return (
                              <div
                                key={prob.code}
                                className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-[var(--theme-hover-bg)] transition-colors"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleProblem(prob.code, !!prob.done)}
                                  disabled={isToggling}
                                  className="w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all cursor-pointer"
                                  style={{
                                    borderColor: prob.done ? 'var(--theme-done)' : 'var(--theme-border-strong)',
                                    backgroundColor: prob.done ? 'var(--theme-done)' : 'transparent',
                                  }}
                                >
                                  {prob.done && <Check className="w-2.5 h-2.5 on-accent" />}
                                </button>

                                <a
                                  href={ncUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex-1 text-xs truncate hover:underline"
                                  style={{
                                    color: prob.done ? 'var(--theme-text-faint)' : 'var(--theme-text)',
                                    textDecoration: prob.done ? 'line-through' : 'none',
                                  }}
                                >
                                  {prob.name}
                                </a>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {prob.is_blind75 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-warning-soft)', color: 'var(--theme-warning)' }}>
                                      B75
                                    </span>
                                  )}
                                  {prob.is_nc150 && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-primary-soft)', color: 'var(--theme-primary)' }}>
                                      150
                                    </span>
                                  )}
                                  {prob.is_ml && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--theme-accent-soft)', color: 'var(--theme-accent)' }}>
                                      ML
                                    </span>
                                  )}
                                  <span
                                    className="text-[10px] font-semibold px-1.5"
                                    style={{ color: DIFFICULTY_COLOR_SP[prob.difficulty] || 'var(--theme-text-muted)' }}
                                  >
                                    {prob.difficulty}
                                  </span>

                                  {/* Links */}
                                  <a
                                    href={ncUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1 rounded hover:bg-[var(--theme-hover-bg)] transition-colors"
                                    title="Open on NeetCode"
                                  >
                                    <Code2 className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-muted)' }} />
                                  </a>
                                  {lcUrl && (
                                    <a
                                      href={lcUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 rounded hover:bg-[var(--theme-hover-bg)] transition-colors"
                                      title="Open on LeetCode"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-faint)' }} />
                                    </a>
                                  )}
                                  {ytUrl && (
                                    <a
                                      href={ytUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 rounded hover:bg-[var(--theme-hover-bg)] transition-colors text-danger"
                                      title="Watch Solution on YouTube"
                                    >
                                      <Video className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectEulerSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<EulerProblem[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    solved: number;
    byDifficulty: Record<string, { total: number; solved: number }>;
  }>({ total: 0, solved: 0, byDifficulty: {} });
  const [cache, setCache] = useState<EulerCacheStatus | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Todo' | 'Done'>('All');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getEulerProblems();
      setProblems(res.problems || []);
      const byDifficulty = res.stats?.byDifficulty || {
        Easy: { total: res.stats?.easy?.total || 0, solved: res.stats?.easy?.completed || 0 },
        Medium: { total: res.stats?.medium?.total || 0, solved: res.stats?.medium?.completed || 0 },
        Hard: { total: res.stats?.hard?.total || 0, solved: res.stats?.hard?.completed || 0 },
      };
      setStats({
        total: res.stats?.total ?? res.totalProblems ?? 0,
        solved: res.stats?.solved ?? res.totalCompleted ?? 0,
        byDifficulty,
      });
      if (res.cache) setCache(res.cache);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await api.syncEulerProblems();
      await load();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSyncing(false);
    }
  };

  const toggleProblem = async (id: number, currentDone: boolean) => {
    setTogglingId(id);
    setProblems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, done: !currentDone } : p))
    );
    setStats((prev) => {
      const delta = !currentDone ? 1 : -1;
      const prob = problems.find((p) => p.id === id);
      const diff = prob?.difficulty ?? 'Medium';
      const prevDiff = prev.byDifficulty[diff] || { total: 0, solved: 0 };
      return {
        ...prev,
        solved: Math.max(0, prev.solved + delta),
        byDifficulty: {
          ...prev.byDifficulty,
          [diff]: {
            ...prevDiff,
            solved: Math.max(0, prevDiff.solved + delta),
          },
        },
      };
    });

    try {
      await api.markEulerProblem(id, !currentDone);
    } catch (e) {
      console.error('Failed to toggle Euler problem:', e);
      await load();
    } finally {
      setTogglingId(null);
    }
  };

  // Filter problems
  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const idMatch = String(p.id) === q || `#${p.id}` === q;
        const titleMatch = p.title.toLowerCase().includes(q);
        if (!idMatch && !titleMatch) return false;
      }
      if (diffFilter !== 'All' && p.difficulty !== diffFilter) return false;
      if (statusFilter === 'Todo' && p.done) return false;
      if (statusFilter === 'Done' && !p.done) return false;
      return true;
    });
  }, [problems, search, diffFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProblems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedProblems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProblems.slice(start, start + PAGE_SIZE);
  }, [filteredProblems, currentPage]);

  const totalProblems = stats.total || problems.length;
  const totalCompleted = stats.solved;
  const pct = totalProblems > 0 ? Math.round((totalCompleted / totalProblems) * 100) : 0;

  const easyTotal = stats.byDifficulty.Easy?.total || 0;
  const easyDone = stats.byDifficulty.Easy?.solved || 0;
  const medTotal = stats.byDifficulty.Medium?.total || 0;
  const medDone = stats.byDifficulty.Medium?.solved || 0;
  const hardTotal = stats.byDifficulty.Hard?.total || 0;
  const hardDone = stats.byDifficulty.Hard?.solved || 0;

  return (
    <div className="rounded-2xl border mb-8 shadow-sm transition-all overflow-hidden" style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 font-bold text-lg" style={{ color: 'var(--theme-text)' }}>
          <Sigma className="w-5 h-5 text-due" />
          Project Euler Tracker
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-text-muted)' }}>
            {totalCompleted}/{totalProblems} ({pct}%)
          </span>
          {isOpen ? <Minus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} /> : <Plus className="w-5 h-5" style={{ color: 'var(--theme-text-muted)' }} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
          {loading ? (
            <SkeletonCards count={3} height="5rem" />
          ) : error ? (
            <div className="text-danger text-xs py-4">{error}</div>
          ) : (
            <>
              {/* Summary Stats & Sync Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>
                    {totalCompleted} / {totalProblems} problems solved
                  </div>
                  <div className="t-micro mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                    Challenging mathematical and computer programming problems · Full offline cache
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {cache && (
                    <span className="text-[11px] font-mono" style={{ color: 'var(--theme-text-faint)' }}>
                      {cache.cacheAgeHours != null ? `${cache.cacheAgeHours}h old` : 'Cached'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all hover:opacity-80 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    title="Sync with projecteuler.net for new problems or updated solver stats"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-due' : ''}`} />
                    {syncing ? 'Syncing…' : 'Sync Euler'}
                  </button>
                  <div className="text-right ml-2">
                    <div className="tnum font-mono font-bold text-2xl" style={{ color: 'var(--theme-primary)' }}>
                      {pct}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full rounded-full h-1.5 mb-5" style={{ backgroundColor: 'var(--theme-border)' }}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--theme-done)' : 'var(--theme-primary)' }}
                />
              </div>

              {/* Difficulty breakdown pills */}
              <div className="flex flex-wrap gap-2 mb-6">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-done)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Easy (≥40k solvers):</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{easyDone}/{easyTotal}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-due)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Medium (4k-40k):</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{medDone}/{medTotal}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs" style={{ backgroundColor: 'var(--theme-surface-2)', borderColor: 'var(--theme-border)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--theme-danger)' }} />
                  <span style={{ color: 'var(--theme-text-muted)' }}>Hard (&lt;4k):</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--theme-text)' }}>{hardDone}/{hardTotal}</span>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5 mb-5">
                <div className="relative flex-1 min-w-[180px]">
                  <input
                    type="text"
                    aria-label="Search Project Euler problems"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search Euler by #ID or title..."
                    className="w-full text-xs rounded-lg px-3 py-1.5 border bg-transparent"
                    style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                  />
                </div>

                <select
                  aria-label="Filter by difficulty"
                  value={diffFilter}
                  onChange={(e) => {
                    setDiffFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="text-xs rounded-lg px-2.5 py-1.5 border bg-transparent"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <option value="All">All Difficulties</option>
                  <option value="Easy">Easy ({easyTotal})</option>
                  <option value="Medium">Medium ({medTotal})</option>
                  <option value="Hard">Hard ({hardTotal})</option>
                </select>

                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="text-xs rounded-lg px-2.5 py-1.5 border bg-transparent"
                  style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                >
                  <option value="All">All Status</option>
                  <option value="Todo">Todo ({totalProblems - totalCompleted})</option>
                  <option value="Done">Solved ({totalCompleted})</option>
                </select>

                {/* Pagination Controls in filter bar */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded border disabled:opacity-30 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono px-1" style={{ color: 'var(--theme-text-muted)' }}>
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="p-1 rounded border disabled:opacity-30 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                      title="Next Page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Problem list grid */}
              {filteredProblems.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                  No Euler problems found matching your criteria.
                </div>
              ) : (
                <div className="divide-y rounded-xl border overflow-hidden" style={{ borderColor: 'var(--theme-border)' }}>
                  {pagedProblems.map((prob) => {
                    const isToggling = togglingId === prob.id;
                    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`Project Euler Problem ${prob.id} solution`)}`;
                    return (
                      <div
                        key={prob.id}
                        className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[var(--theme-hover-bg)] transition-colors"
                        style={{ backgroundColor: 'var(--theme-surface)' }}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleProblem(prob.id, !!prob.done)}
                          disabled={isToggling}
                          className="w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-all cursor-pointer"
                          style={{
                            borderColor: prob.done ? 'var(--theme-done)' : 'var(--theme-border-strong)',
                            backgroundColor: prob.done ? 'var(--theme-done)' : 'transparent',
                          }}
                          title={prob.done ? 'Mark as unsolved' : 'Mark as solved'}
                        >
                          {prob.done && <Check className="w-2.5 h-2.5 on-accent" />}
                        </button>

                        {/* ID badge */}
                        <span className="text-[11px] font-mono font-bold w-12 shrink-0" style={{ color: 'var(--theme-text-faint)' }}>
                          #{prob.id}
                        </span>

                        {/* Title & Link */}
                        <a
                          href={prob.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-xs truncate hover:underline"
                          style={{
                            color: prob.done ? 'var(--theme-text-faint)' : 'var(--theme-text)',
                            textDecoration: prob.done ? 'line-through' : 'none',
                          }}
                        >
                          {prob.title}
                        </a>

                        {/* Badges & Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              color: DIFFICULTY_COLOR_SP[prob.difficulty] || 'var(--theme-text-muted)',
                              backgroundColor: 'var(--theme-surface-2)',
                            }}
                          >
                            {prob.difficulty}
                          </span>

                          <span className="text-[11px] font-mono hidden sm:inline" style={{ color: 'var(--theme-text-faint)' }}>
                            {prob.solvedBy.toLocaleString()} solvers
                          </span>

                          <a
                            href={prob.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded hover:bg-[var(--theme-hover-bg)] transition-colors"
                            title="Open Problem on Project Euler"
                          >
                            <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--theme-text-faint)' }} />
                          </a>

                          <a
                            href={ytUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 rounded hover:bg-[var(--theme-hover-bg)] transition-colors text-danger"
                            title="Watch Solution Walkthrough on YouTube"
                          >
                            <Video className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                  <span>
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredProblems.length)} of {filteredProblems.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2 py-1 rounded border disabled:opacity-30 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      Prev
                    </button>
                    <span className="font-mono px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2 py-1 rounded border disabled:opacity-30 hover:bg-[var(--theme-hover-bg)] transition-colors cursor-pointer"
                      style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text)' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [careerModalOpen, setCareerModalOpen] = useState(false);

  const load = () => api.getStats().then(setStats).catch((e) => setError(String(e)));
  useEffect(() => {
    load();
  }, []);

  const overallPct = useMemo(
    () => (stats && stats.totalNodes ? Math.round((stats.totalDone / stats.totalNodes) * 100) : 0),
    [stats],
  );

  if (error)
    return (
      <div className="grid h-[70vh] place-items-center px-6">
        <EmptyState
          tone="danger"
          role="alert"
          icon={<TriangleAlert className="h-5 w-5" />}
          title="Could not load your dashboard"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          }
        />
      </div>
    );
  if (!stats)
    return (
      <div className="page">
        <LoadingAnnouncer label="Loading your dashboard" />
        <div className="page-head">
          <span className="skeleton skeleton-line block" style={{ width: '16rem', height: '2.1rem' }} aria-hidden="true" />
          <span
            className="skeleton skeleton-line mt-3 block"
            style={{ width: '32rem', maxWidth: '100%', height: '0.9rem' }}
            aria-hidden="true"
          />
        </div>
        <SkeletonMetrics cells={5} className="mb-6" />
        <SkeletonCards count={3} height="5rem" className="mb-6" />
        <SkeletonCards count={4} height="6rem" />
      </div>
    );

  const active = stats.perRoadmap.filter((r) => r.done + r.learning + r.skipped > 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="t-display page-title">Your learning dashboard</h1>
        <p className="t-body page-lede">
          Where you stand across every roadmap you have saved — progress, pace, and what is due.
        </p>
      </header>
      <CoveredSetting onChange={load} />

      {/* Instrument strip: one panel divided by hairlines rather than five
          floating cards. Numbers stay neutral ink — colour marks *state* via
          the dot, so a green number no longer competes with a green "done"
          signal elsewhere on the page. */}
      <div
        className="metric-strip mb-8 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {(
          [
            {
              label: 'Topics done',
              value: stats.totalDone.toLocaleString(),
              dot: 'var(--theme-done)',
              note: stats.totalCovered ? `+${stats.totalCovered} covered` : null,
            },
            {
              label: 'In progress',
              value: stats.totalLearning.toLocaleString(),
              dot: 'var(--theme-learning)',
              note: null,
            },
            {
              label: 'Skipped',
              value: stats.totalSkipped.toLocaleString(),
              dot: 'var(--theme-skipped)',
              note: null,
            },
            {
              label: 'Time invested',
              value: `${stats.totalTimeTracked >= 3600 ? `${Math.floor(stats.totalTimeTracked / 3600)}h ` : ''}${Math.floor((stats.totalTimeTracked % 3600) / 60)}m`,
              dot: 'var(--theme-note)',
              note: null,
            },
            {
              label: 'Mastery',
              value: `${overallPct}%`,
              dot: 'var(--theme-done)',
              note: `${stats.totalNodes.toLocaleString()} tracked`,
              bar: overallPct,
            },
          ] as { label: string; value: string; dot: string; note: string | null; bar?: number }[]
        ).map((cell) => (
          <div
            key={cell.label}
            className="metric px-5 py-4"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: cell.dot }}
                aria-hidden="true"
              />
              <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
                {cell.label}
              </span>
            </div>
            <div
              className="tnum mt-2 font-mono text-[26px] font-medium leading-none"
              style={{ color: 'var(--theme-text)', letterSpacing: '-0.02em' }}
            >
              {cell.value}
            </div>
            {cell.note && (
              <div className="t-micro mt-1.5" style={{ color: 'var(--theme-text-faint)' }}>
                {cell.note}
              </div>
            )}
            {cell.bar !== undefined && (
              <div
                className="mt-2 h-1 overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--theme-border)' }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${cell.bar}%`,
                    backgroundColor: 'var(--theme-primary)',
                    transitionTimingFunction: 'var(--ease-out)',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <CareerRoleBanner onOpen={() => setCareerModalOpen(true)} />

      <VelocityBurnDownCard stats={stats} />

      <ReviewQueue />

      <LeetCodeSection />

      <NeetCodeSection />

      <ProjectEulerSection />

      <ConnectorsPanel />

      <HabiticaDashboardCard />

      <GoogleCalendarCard />

      <BackupControls />

      <StudyStreaks />

      <h2 className="font-bold text-lg mb-3 tracking-tight" style={{ color: 'var(--theme-text)' }}>Recent activity</h2>
      <ActivityTimeline />

      <h2 className="font-bold text-lg mb-3 tracking-tight" style={{ color: 'var(--theme-text)' }}>Progress per roadmap</h2>
      {active.length === 0 ? (
        <div
          className="border border-dashed rounded-2xl p-10 text-center shadow-xs"
          style={{
            backgroundColor: 'var(--theme-surface)',
            borderColor: 'var(--theme-border-strong)',
            color: 'var(--theme-text-muted)',
          }}
        >
          Nothing tracked yet. Open a roadmap and mark topics as Learning / Done / Skip.
        </div>
      ) : (
        <div
          className="rounded-2xl border divide-y overflow-hidden shadow-sm"
          style={{
            backgroundColor: 'var(--theme-surface)',
            borderColor: 'var(--theme-border)',
          }}
        >
          {active.map((r) => (
            <Link
              key={r.slug}
              to={`/roadmap/${encodeURIComponent(r.slug)}`}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 sm:px-6 py-4 hover:bg-[var(--theme-hover-bg)] transition-colors"
            >
              <div className="w-full sm:w-56 truncate font-bold text-sm" style={{ color: 'var(--theme-text)' }}>{r.title}</div>
              <div className="w-full sm:flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-hover-bg)' }}>
                <div className="h-full bg-gradient-to-r from-done to-accent rounded-full" style={{ width: `${r.pct}%` }} />
              </div>
              <div className="text-xs sm:w-48 sm:text-right" style={{ color: 'var(--theme-text-muted)' }}>
                {r.timeTracked >= 3600 ? `${Math.floor(r.timeTracked / 3600)}h ` : ''}{Math.floor((r.timeTracked % 3600) / 60)}m · {r.done}/{r.nodeCount} done · {r.learning} learning
                {r.skipped ? ` · ${r.skipped} skipped` : ''}
              </div>
              <div className="text-sm font-bold sm:w-12 sm:text-right" style={{ color: 'var(--theme-text)' }}>{r.pct}%</div>
            </Link>
          ))}
        </div>
      )}

      <CareerGapModal
        isOpen={careerModalOpen}
        onClose={() => setCareerModalOpen(false)}
      />
    </div>
  );
}
