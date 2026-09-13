import { X } from 'lucide-react';
import { SHORTCUTS, type Shortcut } from '../lib/useHotkeys';

/** Grouped reference for the keyboard shortcuts, opened with `?`. */
export default function ShortcutOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const groups = SHORTCUTS.reduce<Record<string, Shortcut[]>>((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      style={{ backgroundColor: 'var(--theme-scrim)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="anim-pop w-full max-w-md overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-scrim-shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <h2 className="t-heading" style={{ color: 'var(--theme-text)' }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-[var(--theme-hover-bg)]"
            style={{ color: 'var(--theme-text-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-3 last:mb-0">
              <p className="t-label mb-1.5" style={{ color: 'var(--theme-text-faint)' }}>
                {group}
              </p>
              {items.map((s) => (
                <div
                  key={s.keys}
                  className="flex items-center justify-between gap-4 py-1"
                >
                  <span className="t-small" style={{ color: 'var(--theme-text)' }}>
                    {s.label}
                  </span>
                  <kbd
                    className="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px]"
                    style={{
                      borderColor: 'var(--theme-border)',
                      backgroundColor: 'var(--theme-surface-2)',
                      color: 'var(--theme-text-muted)',
                    }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          className="border-t px-4 py-2"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-surface-2)',
          }}
        >
          <p className="t-micro" style={{ color: 'var(--theme-text-faint)' }}>
            Shortcuts are ignored while typing. Press <span className="font-mono">esc</span> to close.
          </p>
        </div>
      </div>
    </div>
  );
}
