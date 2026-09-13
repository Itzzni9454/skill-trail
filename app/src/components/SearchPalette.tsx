import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, StickyNote, Tag, Loader2, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';

interface SearchHit {
  roadmapSlug: string;
  roadmapTitle: string;
  nodeId: string;
  label: string;
  matchType?: 'title' | 'note' | 'content';
  excerpt?: string;
}

type FilterType = 'all' | 'title' | 'content' | 'note';

/**
 * Global full-text search across topic titles, markdown guides, and user notes.
 * Opens with Ctrl+K or the nav button. Follows Google Stitch Material 3 design.
 */
export default function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K toggles the palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setActive(0);
      setFilterType('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced full-text search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchFullText(q)
        .then((r) => {
          if (!alive) return;
          setHits(r.results);
          setActive(0);
        })
        .catch(() => {
          if (!alive) return;
          api.search(q).then((r) => setHits(r.results)).catch(() => setHits([]));
        })
        .finally(() => alive && setLoading(false));
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const filteredHits = useMemo(() => {
    if (filterType === 'all') return hits;
    return hits.filter((h) => h.matchType === filterType);
  }, [hits, filterType]);

  function goTo(hit: SearchHit) {
    setOpen(false);
    navigate(
      `/roadmap/${encodeURIComponent(hit.roadmapSlug)}?node=${encodeURIComponent(hit.nodeId)}`,
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors sm:flex sm:max-w-[280px]"
        style={{
          border: '1px solid var(--theme-border)',
          backgroundColor: 'var(--theme-surface)',
          color: 'var(--theme-text-faint)',
          transitionTimingFunction: 'var(--ease-out)',
        }}
        title="Search topics, guides and notes across all roadmaps"
        aria-label="Open search palette"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Search topics…</span>
        <span className="hidden items-center gap-0.5 md:flex" aria-hidden="true">
          <kbd
            className="rounded border px-1 font-mono text-[10px] leading-4"
            style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-faint)' }}
          >
            ctrl
          </kbd>
          <kbd
            className="rounded border px-1 font-mono text-[10px] leading-4"
            style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-faint)' }}
          >
            K
          </kbd>
        </span>
      </button>
    );
  }

  const FILTERS: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: hits.length },
    { key: 'title', label: 'Topics', count: hits.filter((h) => h.matchType === 'title').length },
    { key: 'content', label: 'Guides', count: hits.filter((h) => h.matchType === 'content').length },
    { key: 'note', label: 'Notes', count: hits.filter((h) => h.matchType === 'note').length },
  ];

  const matchIcon = (t?: string) =>
    t === 'note' ? StickyNote : t === 'content' ? FileText : Tag;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      style={{ backgroundColor: 'var(--theme-scrim)', backdropFilter: 'blur(4px)' }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search topics across all roadmaps"
    >
      <div
        className="anim-pop flex w-full max-w-xl flex-col overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-scrim-shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Query */}
        <div
          className="flex items-center gap-2.5 border-b px-3.5 py-3"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--theme-text-faint)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filteredHits.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && filteredHits[active]) {
                goTo(filteredHits[active]);
              }
            }}
            placeholder="Search topics, guides and notes…"
            className="t-body w-full bg-transparent font-normal"
            style={{ color: 'var(--theme-text)' }}
            aria-label="Search query"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-1 transition-colors"
              style={{ color: 'var(--theme-text-faint)' }}
              aria-label="Clear query"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd
              className="rounded border px-1.5 font-mono text-[10px] leading-4"
              style={{ borderColor: 'var(--theme-border)', color: 'var(--theme-text-faint)' }}
            >
              esc
            </kbd>
          )}
        </div>

        {/* Scope filter */}
        {hits.length > 0 && (
          <div
            className="scrollbar-none flex items-center gap-0.5 overflow-x-auto border-b px-2.5 py-1.5"
            style={{ borderColor: 'var(--theme-border)', backgroundColor: 'var(--theme-surface-2)' }}
            role="tablist"
            aria-label="Filter results by source"
          >
            {FILTERS.map((f) => {
              const on = filterType === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setFilterType(f.key);
                    setActive(0);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] transition-all"
                  style={{
                    backgroundColor: on ? 'var(--theme-surface)' : 'transparent',
                    border: `1px solid ${on ? 'var(--theme-border)' : 'transparent'}`,
                    color: on ? 'var(--theme-text)' : 'var(--theme-text-muted)',
                    fontWeight: on ? 550 : 450,
                    transitionTimingFunction: 'var(--ease-out)',
                  }}
                >
                  {f.label}
                  <span className="tnum font-mono text-[10px]" style={{ color: 'var(--theme-text-faint)' }}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[52vh] min-h-[120px] overflow-y-auto p-1.5">
          {loading && (
            <div
              className="flex items-center justify-center gap-2 px-5 py-10 text-[13px]"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching guides and notes…
            </div>
          )}

          {!loading && query.trim().length >= 2 && filteredHits.length === 0 && (
            <div className="px-5 py-12 text-center">
              <Search className="mx-auto mb-3 h-5 w-5" style={{ color: 'var(--theme-text-faint)' }} />
              <p className="t-small font-medium" style={{ color: 'var(--theme-text)' }}>
                Nothing matches “{query.trim()}”
              </p>
              <p className="t-small mt-1" style={{ color: 'var(--theme-text-faint)' }}>
                Search covers topic titles, official guides and your own notes.
              </p>
            </div>
          )}

          {!loading && query.trim().length < 2 && (
            <div className="px-5 py-12 text-center">
              <p className="t-small" style={{ color: 'var(--theme-text-muted)' }}>
                Type at least two characters.
              </p>
              <p className="t-small mt-2 flex items-center justify-center gap-1.5" style={{ color: 'var(--theme-text-faint)' }}>
                <kbd className="rounded border px-1 font-mono text-[10px]" style={{ borderColor: 'var(--theme-border)' }}>↑</kbd>
                <kbd className="rounded border px-1 font-mono text-[10px]" style={{ borderColor: 'var(--theme-border)' }}>↓</kbd>
                to move
                <kbd className="rounded border px-1 font-mono text-[10px]" style={{ borderColor: 'var(--theme-border)' }}>↵</kbd>
                to open
              </p>
            </div>
          )}

          {filteredHits.map((h, i) => {
            const Icon = matchIcon(h.matchType);
            const on = i === active;
            return (
              <button
                key={`${h.roadmapSlug}:${h.nodeId}:${i}`}
                type="button"
                className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors"
                style={{ backgroundColor: on ? 'var(--theme-primary-soft)' : 'transparent' }}
                onMouseEnter={() => setActive(i)}
                onClick={() => goTo(h)}
              >
                <span
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md"
                  style={{
                    backgroundColor: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-muted)',
                  }}
                  aria-hidden="true"
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className="t-small truncate font-medium"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      {h.label}
                    </span>
                    <span
                      className="t-label shrink-0"
                      style={{ color: 'var(--theme-text-faint)' }}
                    >
                      {h.matchType ?? 'topic'}
                    </span>
                  </span>
                  {h.excerpt && (
                    <span
                      className="mt-0.5 line-clamp-1 block font-mono text-[11px]"
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      {h.excerpt}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="t-micro truncate" style={{ color: 'var(--theme-text-faint)' }}>
                    {h.roadmapTitle}
                  </span>
                  {on && (
                    <CornerDownLeft className="h-3 w-3" style={{ color: 'var(--theme-text-muted)' }} />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Hints */}
        <div
          className="flex items-center justify-between border-t px-3.5 py-2"
          style={{
            borderColor: 'var(--theme-border)',
            backgroundColor: 'var(--theme-surface-2)',
            color: 'var(--theme-text-faint)',
          }}
        >
          <span className="t-micro flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </span>
          {filteredHits.length > 0 && (
            <span className="tnum t-micro font-mono">
              {filteredHits.length} of {hits.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
