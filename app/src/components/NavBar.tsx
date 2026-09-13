import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ChevronDown, Layers, Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { api, type ThemeName } from '../lib/api';
import SearchPalette from './SearchPalette';
import FlashcardModal from './FlashcardModal';
import ShortcutOverlay from './ShortcutOverlay';
import { useGlobalHotkeys } from '../lib/useHotkeys';

const TABS = [
  { to: '/', label: 'Roadmaps' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/dailys', label: 'Dailys' },
  { to: '/habitica', label: 'Habitica' },
  { to: '/editor', label: 'Editor' },
];

/**
 * The four shipped themes.
 *
 * The picker used to carry a hand-copied `bg`/`surface`/`accent` triple per
 * theme as raw oklch literals, which meant the preview silently drifted the
 * moment a token changed (and it did — twice during this redesign). The swatch
 * now renders inside `data-theme={value}`, so it reads the real tokens and
 * cannot go stale.
 */
const THEME_OPTIONS: {
  value: ThemeName;
  label: string;
  hint: string;
  dark: boolean;
}[] = [
  { value: 'light', label: 'Light', hint: 'Cool and crisp', dark: false },
  { value: 'paper', label: 'Paper', hint: 'Warm, ink on cream', dark: false },
  { value: 'dark', label: 'Dark', hint: 'Neutral deep grey', dark: true },
  { value: 'midnight', label: 'Midnight', hint: 'Blue-black, high contrast', dark: true },
];

export default function NavBar() {
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const [quizOpen, setQuizOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { showHelp, setShowHelp } = useGlobalHotkeys(
    () => setQuizOpen(true),
    () => {
      // Cycle through the four shipped themes.
      const i = THEME_OPTIONS.findIndex((t) => t.value === theme);
      setTheme(THEME_OPTIONS[(i + 1) % THEME_OPTIONS.length].value);
    },
  );

  const isDark = theme === 'dark' || theme === 'midnight';
  const current = THEME_OPTIONS.find((t) => t.value === theme) ?? THEME_OPTIONS[0];

  // Surface the review backlog in the shell — it is the one number that tells
  // you whether there is work waiting before you open anything.
  useEffect(() => {
    let alive = true;
    api
      .getReviews()
      .then((r) => {
        if (alive) setDueCount(r.due.length);
      })
      .catch(() => {
        if (alive) setDueCount(null);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  // Close the theme menu on outside click or Escape
  useEffect(() => {
    if (!themeMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setThemeMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setThemeMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [themeMenuOpen]);

  return (
    <nav
      className="bar sticky top-0 z-30 w-full max-w-full border-b"
      aria-label="Main"
    >
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-4 sm:px-5">
        {/* Wordmark */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-md"
          aria-label="Skill Trail — home"
        >
          <span
            className="grid h-6 w-6 place-items-center rounded-lg"
            style={{ backgroundColor: 'var(--theme-primary)' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
              <path
                d="M3 11.5V7.2c0-.5.3-.9.7-1.1l4-2.2c.5-.3 1-.3 1.4 0l3.5 2"
                stroke="var(--theme-primary-ink)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="3" cy="12.5" r="1.6" fill="var(--theme-primary-ink)" />
              <circle cx="12.8" cy="6.6" r="1.6" fill="var(--theme-primary-ink)" />
            </svg>
          </span>
          <span
            className="hidden text-[15px] font-semibold sm:inline"
            style={{ color: 'var(--theme-text)', letterSpacing: '-0.02em' }}
          >
            Roadmaps
          </span>
          <span
            className="t-label hidden rounded px-1.5 py-0.5 lg:inline"
            style={{
              backgroundColor: 'var(--theme-surface-2)',
              color: 'var(--theme-text-faint)',
              border: '1px solid var(--theme-border)',
            }}
          >
            local
          </span>
        </Link>

        {/* Primary nav — segmented control */}
        <div
          className="seg scrollbar-none min-w-0 shrink overflow-x-auto"
          role="tablist"
          aria-label="Primary"
        >
          {TABS.map((t) => {
            const active =
              t.to === '/' ? pathname === '/' || pathname.startsWith('/roadmap/') : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                role="tab"
                aria-selected={active}
                className="seg-item shrink-0"
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <SearchPalette />

        {/* Right cluster */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setQuizOpen(true)}
            className="btn btn-quiet btn-sm relative"
            title="Review due topics"
          >
            <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--theme-primary)' }} aria-hidden="true" />
            <span className="hidden md:inline">Review</span>
            <span className="sr-only md:hidden">Review due topics</span>
            {dueCount !== null && dueCount > 0 && (
              <span
                className="tnum ml-0.5 rounded-full px-1.5 text-[11px] font-semibold leading-[17px]"
                style={{ backgroundColor: 'var(--theme-due-soft)', color: 'var(--theme-due)' }}
                aria-label={`${dueCount} reviews due`}
              >
                {dueCount}
              </span>
            )}
          </button>

          {/* Theme picker */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setThemeMenuOpen((o) => !o)}
              className="btn btn-quiet btn-sm"
              aria-expanded={themeMenuOpen}
              aria-haspopup="menu"
              aria-label={`Theme: ${current.label}. Change theme`}
            >
              {isDark ? (
                <Moon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--theme-text-muted)' }} aria-hidden="true" />
              ) : (
                <Sun className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--theme-text-muted)' }} aria-hidden="true" />
              )}
              <span className="hidden capitalize lg:inline">{current.label}</span>
              <ChevronDown
                className="h-3 w-3 shrink-0 transition-transform"
                style={{
                  color: 'var(--theme-text-faint)',
                  transform: themeMenuOpen ? 'rotate(180deg)' : 'none',
                  transitionTimingFunction: 'var(--ease-out)',
                }}
                aria-hidden="true"
              />
            </button>

            {themeMenuOpen && (
              <div
                role="menu"
                className="anim-pop absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl p-1"
                style={{
                  backgroundColor: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border)',
                  boxShadow: 'var(--theme-shadow)',
                }}
              >
                <p
                  className="t-label px-2.5 pb-1.5 pt-2"
                  style={{ color: 'var(--theme-text-faint)' }}
                >
                  Theme
                </p>
                {THEME_OPTIONS.map((t) => {
                  const active = theme === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setTheme(t.value);
                        setThemeMenuOpen(false);
                      }}
                      className="row-hover flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
                      style={{
                        backgroundColor: active ? 'var(--theme-primary-soft)' : 'transparent',
                      }}
                    >
                      {/* Live swatch. Nesting data-theme re-scopes the token
                          layer to this subtree only, so the swatch shows the
                          real palette of the theme it is offering. */}
                      <span
                        className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md"
                        data-theme={t.value}
                        style={{
                          backgroundColor: 'var(--theme-bg)',
                          border: '1px solid var(--theme-border-strong)',
                        }}
                        aria-hidden="true"
                      >
                        <span
                          className="h-3 w-3 rounded-xs"
                          style={{
                            backgroundColor: 'var(--theme-surface)',
                            border: '1px solid var(--theme-border)',
                          }}
                        />
                        <span
                          className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: 'var(--theme-primary)' }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate text-[13px]"
                          style={{
                            color: 'var(--theme-text)',
                            fontWeight: active ? 550 : 450,
                          }}
                        >
                          {t.label}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: 'var(--theme-text-faint)' }}>
                          {t.hint}
                        </span>
                      </span>
                      {active && (
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--theme-primary)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <FlashcardModal isOpen={quizOpen} onClose={() => setQuizOpen(false)} />
      <ShortcutOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </nav>
  );
}
