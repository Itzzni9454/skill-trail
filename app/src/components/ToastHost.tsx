import { useEffect, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  sub?: string;
  tone?: 'success' | 'info' | 'streak';
}

const TONE_ICON: Record<string, string> = {
  success: '🎉',
  info: 'ℹ️',
  streak: '🔥',
};

type Listener = (toasts: Toast[]) => void;

/** Module-level toast store — any module can push, the host subscribes. */
let toasts: Toast[] = [];
let listeners: Listener[] = [];
let nextId = 1;

export function pushToast(t: Omit<Toast, 'id'>) {
  const toast: Toast = { id: nextId++, tone: 'success', ...t };
  toasts = [...toasts, toast];
  emit();
  // auto-dismiss
  setTimeout(() => dismissToast(toast.id), 4500);
  return toast.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function emit() {
  for (const l of listeners) l(toasts);
}

/** Fixed bottom-right toast stack. */
export default function ToastHost() {
  const [items, setItems] = useState<Toast[]>(toasts);

  useEffect(() => {
    const l: Listener = (t) => setItems([...t]);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast-enter pointer-events-auto max-w-sm rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3 cursor-pointer"
          style={{ backgroundColor: 'var(--theme-slate-900)', color: 'var(--theme-slate-50)' }}
          onClick={() => dismissToast(t.id)}
          title="Click to dismiss"
        >
          <span className="text-xl leading-none mt-0.5">{TONE_ICON[t.tone || 'success']}</span>
          <span>
            <span className="block text-sm font-semibold" style={{ color: 'var(--theme-slate-50)' }}>{t.message}</span>
            {t.sub && <span className="block text-xs mt-0.5" style={{ color: 'var(--theme-slate-400)' }}>{t.sub}</span>}
          </span>
          <button
            className="ml-2 text-sm leading-none"
            style={{ color: 'var(--theme-slate-400)' }}
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
