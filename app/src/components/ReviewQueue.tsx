import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { SkeletonBar, LoadingAnnouncer } from './Skeleton';
import { Brain } from 'lucide-react';
import { pushToast } from './ToastHost';
import FlashcardModal from './FlashcardModal';
import { calculateRetention } from '../lib/retention';

type Reviews = Awaited<ReturnType<typeof api.getReviews>>;
type ReviewItem = Reviews['due'][number];

const MAX_SHOWN = 8;

/** "due today" / "3d overdue" / "due Sat" helper. */
function dueText(dueAt: string, overdueDays: number): string {
  if (overdueDays >= 1) return `${overdueDays}d overdue`;
  const t = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(t);
  dueDay.setHours(0, 0, 0, 0);
  if (dueDay.getTime() === today.getTime()) return 'due today';
  return `due ${t.toLocaleDateString(undefined, { weekday: 'short' })}`;
}

/** Circular badge showing ladder progress (stage out of total stages). */
function StageBadge({ stage, total }: { stage: number; total: number }) {
  const R = 9;
  const C = 2 * Math.PI * R;
  const pct = Math.min(1, stage / total);
  return (
    <svg width={26} height={26} viewBox="0 0 26 26" className="-rotate-90 shrink-0">
      <circle cx="13" cy="13" r={R} fill="none" strokeWidth="3" style={{ stroke: 'var(--theme-border)' }} />
      <circle
        cx="13"
        cy="13"
        r={R}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ stroke: stage >= total ? 'var(--theme-primary)' : 'var(--theme-learning)' }}
        strokeDasharray={C}
        strokeDashoffset={C * (1 - pct)}
      />
      <text
        x="13"
        y="13"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: stage >= total ? 'var(--theme-primary)' : 'var(--theme-text-muted)', fontSize: 9, fontWeight: 700 }}
        transform="rotate(90 13 13)"
      >
        {stage + 1}
        {/* total shown via title below */}
      </text>
    </svg>
  );
}

export default function ReviewQueue() {
  const [data, setData] = useState<Reviews | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizItems, setQuizItems] = useState<ReviewItem[] | undefined>(undefined);

  const load = useCallback(() => {
    api
      .getReviews()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function answer(item: ReviewItem, grade: 'good' | 'again' | 'dismiss') {
    setBusy(`${item.slug}|${item.nodeId}`);
    try {
      const res = await api.answerReview(item.slug, item.nodeId, grade);
      if (grade === 'good' && res.graduated) {
        pushToast({
          message: `"${item.label}" fully reviewed! 🎓`,
          sub: 'All 6 intervals complete — it\'s in long-term memory now.',
        });
      }
    } catch {
      pushToast({ tone: 'info', message: 'Failed to save answer — is the server running?' });
    }
    setBusy(null);
    load();
  }

  async function snoozeAll() {
    setBusy('snooze');
    try {
      const res = await api.snoozeAllReviews(1);
      pushToast({ tone: 'info', message: `Snoozed ${res.moved} review${res.moved === 1 ? '' : 's'} by 1 day.` });
    } catch {
      pushToast({ tone: 'info', message: 'Snooze failed — is the server running?' });
    }
    setBusy(null);
    load();
  }

  if (error) return null; // widget stays out of the way when the server has no data

  if (!data) {
    return (
      <div className="card mb-8 flex items-center gap-3.5 p-5">
        <LoadingAnnouncer label="Loading review queue" />
        <span className="skeleton" style={{ width: '2.5rem', height: '2.5rem', borderRadius: 'var(--r)' }} aria-hidden="true" />
        <div className="flex flex-col gap-2">
          <SkeletonBar width="9rem" height="0.8rem" />
          <SkeletonBar width="20rem" height="0.65rem" />
        </div>
      </div>
    );
  }
  if (data.due.length === 0) {
    return (
      <div
        className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
        style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
      >
        <div className="flex items-center gap-3.5">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
            style={{ backgroundColor: 'var(--theme-note-soft)', color: 'var(--theme-note)' }}
          >
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="t-heading" style={{ color: 'var(--theme-text)' }}>Review queue clear</div>
            <div className="t-small mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
              {/* Say when to come back rather than just "scheduled for future" —
                  an unscheduled-looking queue is what made this read as broken. */}
              {data.nextUpcoming
                ? `Next up “${data.nextUpcoming.label}” — due in ${
                    data.nextUpcoming.hoursUntil < 24
                      ? `${data.nextUpcoming.hoursUntil}h`
                      : `${Math.round(data.nextUpcoming.hoursUntil / 24)}d`
                  }.`
                : 'Mark topics as Done in any roadmap and they’ll show up here for spaced repetition.'}
            </div>
          </div>
          <span className="ml-auto text-xs font-medium hidden sm:block px-3 py-1 rounded-full border" style={{ color: 'var(--theme-text-muted)', borderColor: 'var(--theme-border-strong)', backgroundColor: 'var(--theme-surface-soft)' }}>
            Intervals: 1 · 3 · 7 · 14 · 30 · 90 days
          </span>
        </div>
      </div>
    );
  }

  const due = expanded ? data.due : data.due.slice(0, MAX_SHOWN);
  const hidden = data.due.length - due.length;

  return (
    <div
      className="rounded-2xl border p-6 mb-8 shadow-sm transition-all"
      style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-note-soft text-note flex items-center justify-center text-2xl shrink-0">
            🧠
          </div>
          <div>
            <h2 className="font-bold flex items-center gap-2" style={{ color: 'var(--theme-text)', fontSize: 16 }}>
              Review Queue
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-due-soft text-due border border-due/30">
                {data.due.length} due
              </span>
            </h2>
            {data.upcomingCount > 0 && (
              <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                {data.upcomingCount} upcoming spaced reviews scheduled
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-learning hover:bg-learning on-accent shadow-xs cursor-pointer flex items-center gap-2 transition-all hover:shadow-md"
            onClick={() => {
              setQuizItems(data.due);
              setQuizOpen(true);
            }}
            title="Launch interactive active recall flashcard quiz session"
          >
            <span>🃏 Practice Quiz</span>
            <span className="bg-learning-soft px-2 py-0.5 rounded-full text-[10px] font-bold">{data.due.length}</span>
          </button>
          <button
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors disabled:opacity-50 cursor-pointer"
            style={{
              color: 'var(--theme-text)',
              borderColor: 'var(--theme-border-strong)',
              backgroundColor: 'var(--theme-surface)',
            }}
            onClick={snoozeAll}
            disabled={busy === 'snooze'}
            title="Push all due reviews to tomorrow"
          >
            {busy === 'snooze' ? 'Snoozing…' : '⏰ Snooze 1d'}
          </button>
        </div>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--theme-border)' }}>
        {due.map((item) => {
          const key = `${item.slug}|${item.nodeId}`;
          const total = data.intervals.length;
          const ret = calculateRetention(item.dueAt, item.intervalDays);

          return (
            <div key={key} className="flex items-center gap-3 py-3">
              <StageBadge stage={item.stage} total={total} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/roadmap/${encodeURIComponent(item.slug)}?node=${encodeURIComponent(item.nodeId)}`}
                    className="font-semibold truncate hover:underline"
                    style={{ color: 'var(--theme-text)', fontSize: 14 }}
                    title={`Review "${item.label}" in ${item.slug}`}
                  >
                    {item.label}
                  </Link>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border"
                    style={{
                      backgroundColor: `${ret.color}15`,
                      color: ret.color,
                      borderColor: `${ret.color}30`,
                    }}
                    title={`Estimated memory retention: ${ret.percentage}% (${ret.statusText})`}
                  >
                    {ret.percentage}% memory
                  </span>
                </div>
                <div style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
                  {dueText(item.dueAt, item.overdueDays)}
                  {item.intervalDays > 0 && ` · last interval ${item.intervalDays}d`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold hover:bg-learning-soft text-learning cursor-pointer transition-colors"
                  onClick={() => {
                    setQuizItems([item]);
                    setQuizOpen(true);
                  }}
                  title="Practice this topic card"
                >
                  🃏
                </button>
                <button
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-due-soft text-due hover:bg-due-soft border border-due/30 transition-colors disabled:opacity-50 cursor-pointer"
                  onClick={() => answer(item, 'again')}
                  disabled={busy === key}
                  title="Couldn't recall it — review again tomorrow"
                >
                  Again
                </button>
                <button
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-done-soft text-done hover:bg-done-soft border border-done/30 transition-colors disabled:opacity-50 cursor-pointer"
                  onClick={() => answer(item, 'good')}
                  disabled={busy === key}
                  title="Recalled it — advance to next interval"
                >
                  Got it
                </button>
                <button
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold hover:bg-active text-ink-faint hover:text-ink-muted transition-colors disabled:opacity-50 cursor-pointer"
                  onClick={() => answer(item, 'dismiss')}
                  disabled={busy === key}
                  title="Remove this topic from the review queue"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          className="mt-3 w-full text-xs font-semibold py-1 hover:text-ink cursor-pointer"
          style={{ color: 'var(--theme-text-muted)' }}
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more…
        </button>
      )}

      <FlashcardModal
        isOpen={quizOpen}
        items={quizItems}
        onClose={() => {
          setQuizOpen(false);
          load();
        }}
        onComplete={load}
      />
    </div>
  );
}
