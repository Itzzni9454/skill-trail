import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

type Streaks = Awaited<ReturnType<typeof api.getStreaks>>;

/** Cells per week column; ~26 weeks fits a dashboard column nicely. */
const WEEKS = 26;
const CELL = 13; // px, matches w-[13px] h-[13px] classes below
const GAP = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function intensity(n: number | undefined): string {
  if (!n) return '';
  if (n <= 2) return 'var(--theme-primary-soft)';
  if (n <= 5) return 'color-mix(in oklab, var(--theme-primary) 45%, var(--theme-border))';
  if (n <= 10) return 'color-mix(in oklab, var(--theme-primary) 72%, var(--theme-border))';
  return 'var(--theme-primary)';
}

/** Monday-first weekday index (0 = Mon … 6 = Sun). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const RING_SIZE = 72;
const RING_STROKE = 7;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** Circular progress showing today's actions vs the daily goal. */
function ProgressRing({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(1, goal > 0 ? done / goal : 0);
  const complete = done >= goal && goal > 0;
  return (
    <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" strokeWidth={RING_STROKE} style={{ stroke: 'var(--theme-border)' }} />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          style={{ stroke: complete ? 'var(--theme-primary)' : 'var(--theme-due)', transition: 'stroke-dashoffset 500ms ease', strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - pct) }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div style={{ color: complete ? 'var(--theme-primary)' : 'var(--theme-text)', fontSize: 14, fontWeight: 900 }}>{done}</div>
          <div style={{ color: 'var(--theme-text-muted)', fontSize: 10, fontWeight: 500 }}>/ {goal}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * GitHub-style study heatmap (last ~26 weeks, Monday-first columns)
 * plus current/longest streak cards and today's goal ring.
 */
export default function StudyStreaks() {
  const [data, setData] = useState<Streaks | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);

  function load() {
    api.getStreaks().then(setData).catch(() => setData(null));
  }

  useEffect(() => {
    load();
    // refresh when the tab regains focus so the ring reflects recent studying
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);

  async function saveGoal() {
    const n = parseInt(goalDraft, 10);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      setGoalError('Enter a number between 1 and 1000');
      return;
    }
    try {
      await api.setDailyGoal(n);
      setData((d) => (d ? { ...d, dailyGoal: n } : d));
      setEditingGoal(false);
      setGoalError(null);
    } catch {
      setGoalError('Save failed — is the server running?');
    }
  }

  const grid = useMemo(() => {
    // columns of weeks, oldest on the left, ending with the current week
    const today = new Date();
    const end = addDays(today, 6 - mondayIndex(today)); // saturday ending current week
    const start = addDays(end, -7 * WEEKS + 1);
    const cols: { key: string; date: Date; count: number | undefined; future: boolean }[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const key = dateKey(date);
        col.push({ key, date, count: data?.days?.[key], future: date > today });
      }
      cols.push(col);
    }
    return cols;
  }, [data]);

  if (!data) return null;

  const goalDone = data.todayCount || 0;
  const goalMet = goalDone >= data.dailyGoal;
  const gridWidth = WEEKS * (CELL + GAP);

  return (
    <div className="rounded-2xl border p-4 sm:p-6 mb-8 shadow-sm transition-all max-w-full overflow-hidden" style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text-muted)' }}>Current streak</div>
          <div className="text-3xl font-black mt-1" style={{ color: 'var(--theme-due)' }}>
            {data.currentStreak}
            <span className="text-base font-bold ml-1" style={{ color: 'var(--theme-text-muted)' }}>day{data.currentStreak === 1 ? '' : 's'}</span>
          </div>
          {data.nextMilestone && (
            <div className="mt-2" title={`${data.nextMilestone - data.currentStreak} more day${data.nextMilestone - data.currentStreak === 1 ? '' : 's'} to reach ${data.nextMilestone}`}
            >
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--theme-border)' }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((data.currentStreak / data.nextMilestone) * 100))}%`, background: 'linear-gradient(to right, var(--theme-due), var(--theme-due))' }}
                />
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                {data.nextMilestone - data.currentStreak} day{data.nextMilestone - data.currentStreak === 1 ? '' : 's'} to {data.nextMilestone}-day milestone
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text-muted)' }}>Longest streak</div>
          <div className="text-3xl font-black mt-1" style={{ color: 'var(--theme-text)' }}>
            {data.longestStreak}
            <span className="text-base font-bold ml-1" style={{ color: 'var(--theme-text-muted)' }}>day{data.longestStreak === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text-muted)' }}>Active days</div>
          <div className="text-3xl font-black mt-1" style={{ color: 'var(--theme-primary)' }}>{data.activeDays}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text-muted)' }}>Total actions</div>
          <div className="text-3xl font-black mt-1" style={{ color: 'var(--theme-text)' }}>{data.totalActions}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide font-bold" style={{ color: 'var(--theme-text-muted)' }}>Today's goal</div>
          <div className="flex items-center gap-3 mt-2">
            <ProgressRing done={goalDone} goal={data.dailyGoal} />
            {editingGoal ? (
              <div>
                <input
                  autoFocus
                  type="number"
                  aria-label="Daily goal, number of topics"
                  min={1}
                  max={1000}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveGoal();
                    if (e.key === 'Escape') setEditingGoal(false);
                  }}
                  className="w-16 px-2 py-1 text-sm rounded-md border resize-y"
                  style={{ borderColor: 'var(--theme-border-strong)', color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
                />
                <div className="flex gap-1 mt-1">
                  <button
                    className="px-2 py-0.5 text-[11px] font-semibold rounded on-accent hover:bg-done"
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                    onClick={saveGoal}
                  >
                    Save
                  </button>
                  <button
                    className="px-2 py-0.5 text-[11px] font-semibold rounded hover:bg-active"
                    style={{ color: 'var(--theme-text-muted)', backgroundColor: 'var(--theme-hover-bg)' }}
                    onClick={() => setEditingGoal(false)}
                  >
                    Cancel
                  </button>
                </div>
                {goalError && <div className="text-[10px] mt-1 w-28" style={{ color: 'var(--theme-danger)' }}>{goalError}</div>}
              </div>
            ) : (
              <div>
                <button
                  className="text-[11px] hover:text-ink-muted underline underline-offset-2"
                  style={{ color: 'var(--theme-text-muted)' }}
                  onClick={() => {
                    setGoalDraft(String(data.dailyGoal));
                    setGoalError(null);
                    setEditingGoal(true);
                  }}
                  title="Change daily goal"
                >
                  edit
                </button>
                <div className={`text-[11px] font-semibold mt-0.5 ${goalMet ? 'text-done' : ''}`} style={{ color: goalMet ? 'var(--theme-primary)' : 'var(--theme-text-muted)' }}>
                  {goalMet ? '🎉 goal met!' : `${Math.max(0, data.dailyGoal - goalDone)} to go`}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1 max-w-full">
        <div style={{ width: gridWidth }} className="relative">
          {/* month labels */}
          <div className="flex text-[10px] font-medium select-none" style={{ marginBottom: 4, height: 14, color: 'var(--theme-text-faint)' }}>
            {grid.map((col, w) => {
              const first = col[0].date;
              const show = w === 0 || first.getMonth() !== grid[w - 1][0].date.getMonth();
              return (
                <div key={w} style={{ width: CELL + GAP }} className="shrink-0">
                  {show ? MONTHS[first.getMonth()] : ''}
                </div>
              );
            })}
          </div>
          <div className="flex">
            {/* weekday labels */}
            <div className="flex flex-col text-[10px] select-none mr-1" style={{ gap: GAP, color: 'var(--theme-text-faint)' }}>
              {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((l, i) => (
                <div key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>{l}</div>
              ))}
            </div>
              {/* cells */}
            {grid.map((col, w) => (
              <div key={w} className="flex flex-col shrink-0" style={{ gap: GAP }}>
                {col.map((cell) => {
                  const hasActions = (cell.count || 0) > 0;
                  const bg = intensity(cell.count) || 'var(--theme-hover-bg)';
                  return (
                    <div
                      key={cell.key}
                      className={`${cell.future ? 'opacity-0' : ''} rounded-xs transition-transform hover:scale-125 cursor-pointer`}
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: bg,
                        border: hasActions ? 'none' : '1px solid var(--theme-border)',
                      }}
                      onMouseEnter={(e) =>
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          text: cell.future
                            ? ''
                            : `${cell.count || 0} action${(cell.count || 0) === 1 ? '' : 's'} · ${cell.key}`,
                        })
                      }
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-4 text-[11px]" style={{ color: 'var(--theme-text-muted)' }}>
        <span>Less</span>
        <span className="w-[13px] h-[13px] rounded-xs border" style={{ backgroundColor: 'var(--theme-hover-bg)', borderColor: 'var(--theme-border)' }} />
        <span className="w-[13px] h-[13px] rounded-xs" style={{ backgroundColor: 'var(--theme-primary-soft)' }} />
        <span className="w-[13px] h-[13px] rounded-xs" style={{ backgroundColor: 'color-mix(in oklab, var(--theme-primary) 45%, var(--theme-border))' }} />
        <span className="w-[13px] h-[13px] rounded-xs" style={{ backgroundColor: 'color-mix(in oklab, var(--theme-primary) 72%, var(--theme-border))' }} />
        <span className="w-[13px] h-[13px] rounded-xs" style={{ backgroundColor: 'var(--theme-primary)' }} />
        <span>More</span>
      </div>

      {tooltip && tooltip.text && (
        <div
          className="fixed z-50 pointer-events-none text-xs rounded-md px-2.5 py-1.5 shadow-lg"
          style={{ left: tooltip.x + 8, top: tooltip.y - 30, backgroundColor: 'var(--theme-slate-900)', color: 'var(--theme-slate-50)' }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
