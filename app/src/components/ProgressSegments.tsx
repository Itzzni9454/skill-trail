/**
 * Progress displays shared across the app.
 *
 * A single "percent complete" number hides what actually changed, so these
 * render progress as a segmented track — each state (done / learning / skipped /
 * covered) occupies its own portion — with a legend and tabular figures. Sizing
 * is always proportional to *total*, so the remainder reads as untouched work.
 */
import type { CSSProperties } from 'react';

export interface ProgressParts {
  done: number;
  learning: number;
  skipped: number;
  /** Done in another roadmap — displayed, never counted as done here. */
  covered?: number;
  total: number;
}

const SEGMENTS: { key: keyof ProgressParts; label: string; varName: string }[] = [
  { key: 'done', label: 'done', varName: '--theme-done' },
  { key: 'covered', label: 'covered', varName: '--theme-learning' },
  { key: 'learning', label: 'learning', varName: '--theme-learning' },
  { key: 'skipped', label: 'skipped', varName: '--theme-skipped' },
];

/** Multi-state progress track. Segments are sized as a share of `total`. */
export function ProgressSegments({
  parts,
  height = 6,
  className = '',
  title,
}: {
  parts: ProgressParts;
  height?: number;
  className?: string;
  title?: string;
}) {
  const total = Math.max(1, parts.total || 1);
  const pctOf = (n: number) => `${Math.min(100, (n / total) * 100)}%`;

  return (
    <span
      className={`flex overflow-hidden rounded-full ${className}`}
      style={{ height, backgroundColor: 'var(--theme-border)' }}
      role="img"
      aria-label={
        title ||
        `${parts.done} of ${parts.total} done, ${parts.learning} learning, ${parts.skipped} skipped`
      }
      title={title}
    >
      {SEGMENTS.map((s) => {
        const value = (parts[s.key] as number) || 0;
        if (!value) return null;
        return (
          <span
            key={s.key}
            className="block transition-[width] duration-500"
            style={{
              width: pctOf(value),
              backgroundColor: `var(${s.varName})`,
              transitionTimingFunction: 'var(--ease-out)',
            }}
          />
        );
      })}
    </span>
  );
}

/** Dot + value + label for each state, in mono. */
export function ProgressLegend({
  parts,
  showCovered = true,
}: {
  parts: ProgressParts;
  showCovered?: boolean;
}) {
  const rows: { label: string; value: number; color: string; title?: string }[] = [
    { label: 'done', value: parts.done, color: 'var(--theme-done)' },
    { label: 'learning', value: parts.learning, color: 'var(--theme-learning)' },
    { label: 'skipped', value: parts.skipped, color: 'var(--theme-skipped)' },
  ];
  if (showCovered && parts.covered) {
    rows.splice(1, 0, {
      label: 'covered',
      value: parts.covered,
      color: 'var(--theme-learning)',
      title: 'Already done in another roadmap',
    });
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1" style={{ display: 'inline-flex' }}>
      {rows.map((r) => (
        <span key={r.label} className="flex items-baseline gap-1.5" title={r.title}>
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: r.color }}
            aria-hidden="true"
          />
          <span className="tnum font-mono text-[12px]" style={{ color: 'var(--theme-text)' }}>
            {r.value}
          </span>
          <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            {r.label}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Slim progress band: legend on the left, track in the middle, completion on the
 * right. Sits under the roadmap toolbar so progress is always visible without
 * being a card competing with the canvas.
 */
export function ProgressBand({
  parts,
  pct,
}: {
  parts: ProgressParts;
  pct: number;
}) {
  const style: CSSProperties = {
    backgroundColor: 'var(--theme-surface)',
    borderBottom: '1px solid var(--theme-border)',
  };
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6"
      style={style}
      role="group"
      aria-label="Roadmap progress"
    >
      <ProgressLegend parts={parts} />
      <ProgressSegments parts={parts} className="min-w-[120px] flex-1" height={6} />
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span
          className="tnum font-mono text-[13px] font-medium"
          style={{ color: 'var(--theme-text)' }}
        >
          {pct}%
        </span>
        <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
          complete
        </span>
      </span>
    </div>
  );
}
