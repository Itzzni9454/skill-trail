/**
 * Global keyboard shortcuts.
 *
 * Everything is guarded so shortcuts never fire while the user is typing, and
 * never hijack browser/OS chords. Navigation uses a `g` prefix (go) rather than
 * bare letters, so a stray keypress can't throw you to another page.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** True when the event originates somewhere that accepts text input. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable === true
  );
}

export interface Shortcut {
  keys: string;
  label: string;
  group: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'g then h', label: 'Go to roadmaps', group: 'Navigate' },
  { keys: 'g then d', label: 'Go to dashboard', group: 'Navigate' },
  { keys: 'g then e', label: 'Go to editor', group: 'Navigate' },
  { keys: 't', label: 'Cycle theme', group: 'View' },
  { keys: 'r', label: 'Open review deck', group: 'Study' },
  { keys: 'ctrl K', label: 'Search everything', group: 'Study' },
  { keys: '?', label: 'This shortcut list', group: 'View' },
];

/** Window for the two-key `g` sequence, in ms. */
const SEQ_TIMEOUT = 1200;

export function useGlobalHotkeys(onOpenReview: () => void, onCycleTheme: () => void) {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const pending = useRef<{ key: string; at: number } | null>(null);
  const handlers = useRef({ onOpenReview, onCycleTheme });
  handlers.current = { onOpenReview, onCycleTheme };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      // Never shadow browser or OS chords.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key.toLowerCase();
      const now = Date.now();
      const prev = pending.current;
      pending.current = null;

      if (prev && now - prev.at < SEQ_TIMEOUT && prev.key === 'g') {
        const dest: Record<string, string> = {
          h: '/',
          d: '/dashboard',
          e: '/editor',
        };
        if (dest[k]) {
          e.preventDefault();
          navigate(dest[k]);
          return;
        }
      }

      if (k === 'g') {
        pending.current = { key: 'g', at: now };
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (k === 't') {
        e.preventDefault();
        handlers.current.onCycleTheme();
        return;
      }
      if (k === 'r') {
        e.preventDefault();
        handlers.current.onOpenReview();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    if (!showHelp) return;
    function close() {
      setShowHelp(false);
    }
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [showHelp]);

  return { showHelp, setShowHelp };
}
