/**
 * Shared modal frame.
 *
 * All four modals (flashcards, badge/Anki, vault sync, achievements) had the
 * same hand-rolled backdrop, panel, header and close button — four copies of
 * the same markup that had each drifted slightly. This is the single version:
 * consistent radius, spacing, scrim and typography, plus the accessibility
 * plumbing (Escape, labelled dialog, focus capture and restore) done once.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Short label used for the dialog's accessible name. */
  label: string;
  title: string;
  /** One-line explanation under the title. */
  subtitle?: string;
  /** Small square icon shown left of the title. */
  icon?: ReactNode;
  /** Optional pill next to the title (progress counters, counts). */
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
}

export default function ModalShell({
  open,
  onClose,
  label,
  title,
  subtitle,
  icon,
  badge,
  footer,
  children,
  width = 'max-w-xl',
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreTo = useRef<Element | null>(null);

  // Escape to dismiss — but only for the topmost concern here; modals in this
  // app are never stacked.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Move focus into the dialog and put it back where it came from on close.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{
        backgroundColor: 'var(--theme-scrim)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`anim-pop flex max-h-[88vh] w-full ${width} flex-col overflow-hidden rounded-xl no-focus-ring`}
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-scrim-shadow)',
          color: 'var(--theme-text)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={titleId}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: 'var(--theme-surface-2)', color: 'var(--theme-accent)' }}
                aria-hidden="true"
              >
                {icon}
              </span>
            )}
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <h2 id={titleId} className="t-heading" style={{ color: 'var(--theme-text)' }}>
                {title}
              </h2>
              {badge}
              {subtitle && (
                <p className="t-micro mt-0.5" style={{ color: 'var(--theme-text-faint)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--theme-hover-bg)]"
            style={{ color: 'var(--theme-text-faint)' }}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div
            className="shrink-0 border-t px-5 py-3"
            style={{
              borderColor: 'var(--theme-border)',
              backgroundColor: 'var(--theme-surface-2)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
