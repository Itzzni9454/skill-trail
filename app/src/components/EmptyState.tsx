/**
 * EmptyState — the single empty / error / zero-result panel.
 *
 * `.state-panel` and `.state-icon` have been in index.css since the first
 * redesign pass and, like `.skeleton`, were referenced by nothing. In practice
 * every empty case was hand-rolled: four files built their own dashed panel
 * with a call to action, and eight more rendered a bare sentence with no way
 * forward.
 *
 * The rule this encodes: an empty state is a dead end unless it either explains
 * why the space is empty or offers the action that fills it. So `action` is a
 * first-class prop, and every caller is expected to pass one when a sensible
 * next step exists.
 */
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'danger' | 'due' | 'accent';

const TONE: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: {
    fg: 'var(--theme-text-muted)',
    bg: 'var(--theme-surface-2)',
    border: 'var(--theme-border)',
  },
  accent: {
    fg: 'var(--theme-primary)',
    bg: 'var(--theme-primary-soft)',
    border: 'var(--theme-primary)',
  },
  danger: {
    fg: 'var(--theme-danger)',
    bg: 'var(--theme-danger-soft)',
    border: 'var(--theme-danger)',
  },
  due: {
    fg: 'var(--theme-due)',
    bg: 'var(--theme-due-soft)',
    border: 'var(--theme-due)',
  },
};

interface Props {
  /** A lucide icon element, sized ~20px. Decorative — hidden from AT. */
  icon?: ReactNode;
  title: string;
  /** One or two sentences. Say what would make this space non-empty. */
  description?: ReactNode;
  /** The way out. Omit only when there genuinely is no next step. */
  action?: ReactNode;
  /** Secondary action rendered beside `action`. */
  secondaryAction?: ReactNode;
  tone?: Tone;
  /** Tighter padding, for panels inside a drawer or a modal. */
  compact?: boolean;
  /** `alert` when the panel is reporting a failure. */
  role?: 'status' | 'alert';
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  compact = false,
  role,
  className = '',
}: Props) {
  const t = TONE[tone];

  return (
    <div
      className={`state-panel ${className}`}
      role={role}
      style={compact ? { padding: 'clamp(1.25rem, 4vw, 2rem) 1.25rem' } : undefined}
    >
      {icon && (
        <span
          className="state-icon"
          style={{
            color: t.fg,
            background: t.bg,
            borderColor: t.border,
            ...(compact ? { width: '2.25rem', height: '2.25rem', marginBottom: '0.7rem' } : null),
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      <p className="t-heading" style={{ color: 'var(--theme-text)' }}>
        {title}
      </p>

      {description && (
        <p
          className="t-small mt-1.5 max-w-[46ch]"
          style={{ color: 'var(--theme-text-muted)' }}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
