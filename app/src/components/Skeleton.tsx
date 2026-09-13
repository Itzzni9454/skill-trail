/**
 * Skeleton primitives.
 *
 * The `.skeleton` class has existed in index.css since the first redesign pass
 * but was never referenced by a single component — every async region instead
 * rendered the literal words "Loading…", a bare spinner, or nothing at all.
 *
 * The rule these follow: a skeleton must occupy the same box as the content it
 * stands in for. A centred "Loading…" collapses the layout the moment data
 * arrives, which reads as a glitch; a skeleton in the right shape reads as the
 * page arriving. So each helper below is shaped after a real layout in this app
 * rather than being a generic grey bar.
 *
 * Every skeleton is `aria-hidden` — the live region that announces loading is
 * the caller's job (see `LoadingAnnouncer`), because a screen reader walking
 * eight decorative bars is worse than silence.
 */
import type { CSSProperties } from 'react';

interface BarProps {
  /** Any CSS width — a percentage string for fluid, a rem value for fixed. */
  width?: string;
  height?: string;
  className?: string;
  style?: CSSProperties;
}

/** A single skeleton bar. */
export function SkeletonBar({ width = '100%', height = '0.75rem', className = '', style }: BarProps) {
  return (
    <span
      className={`skeleton skeleton-line block ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** N stacked text lines, the last one short so it reads as a paragraph. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <span className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} width={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  );
}

/**
 * Stand-in for the Home roadmap list: index, title + description, count and
 * percentage. Mirrors `.skeleton-row` in index.css.
 */
export function SkeletonRoadmapList({ rows = 9, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ opacity: 1 - i * 0.07 }}>
          <SkeletonBar width="1.5rem" height="0.6rem" />
          <div className="flex flex-col gap-2">
            <SkeletonBar width={`${38 + ((i * 13) % 26)}%`} height="0.7rem" />
            <SkeletonBar width={`${54 + ((i * 7) % 22)}%`} height="0.6rem" />
          </div>
          <div className="flex items-center gap-4">
            <SkeletonBar width="2.6rem" height="0.6rem" />
            <SkeletonBar width="5rem" height="0.25rem" />
            <SkeletonBar width="1.75rem" height="0.6rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a hairline-divided metric strip. */
export function SkeletonMetrics({ cells = 5, className = '' }: { cells?: number; className?: string }) {
  return (
    <div
      className={`metric-strip ${className}`}
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="metric flex flex-col gap-2">
          <SkeletonBar width="4.5rem" height="0.55rem" />
          <SkeletonBar width="3rem" height="1.4rem" />
          <SkeletonBar width="5.5rem" height="0.5rem" />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a grid of cards (Dailys, Habitica, achievements). */
export function SkeletonCards({
  count = 6,
  columns = 'repeat(auto-fill, minmax(15rem, 1fr))',
  height = '7.5rem',
  className = '',
}: {
  count?: number;
  columns?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div className={`grid gap-3 ${className}`} style={{ gridTemplateColumns: columns }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SkeletonBar width="3.5rem" height="0.55rem" />
            <SkeletonBar width="2.5rem" height="0.7rem" />
          </div>
          <SkeletonBar width={`${52 + ((i * 11) % 30)}%`} height="0.8rem" />
          <SkeletonBar width="70%" height="0.6rem" />
          <div style={{ height }} className="flex items-end">
            <SkeletonBar width="4rem" height="1.75rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for the roadmap canvas while the JSON is in flight. */
export function SkeletonCanvas({ className = '' }: { className?: string }) {
  return (
    <div className={`grid h-full w-full place-items-center ${className}`} aria-hidden="true">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-3">
          {[0, 1, 2].map((c) => (
            <div key={c} className="flex flex-col gap-3" style={{ opacity: 1 - c * 0.22 }}>
              {Array.from({ length: 5 }).map((_, r) => (
                <SkeletonBar
                  key={r}
                  width={`${(r % 2 === 0 ? 6.5 : 4.75) + ((c + r) % 3) * 0.6}rem`}
                  height="1.6rem"
                  style={{ borderRadius: 'var(--r-sm)' }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Screen-reader-only status for a loading region.
 *
 * `role="status"` + `aria-live="polite"` means the message is announced once
 * without stealing focus, and the visually hidden text keeps sighted users from
 * reading "Loading" next to a skeleton that already says it.
 */
export function LoadingAnnouncer({ label = 'Loading content' }: { label?: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {label}
    </span>
  );
}

export default SkeletonBar;
