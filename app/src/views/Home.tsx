import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpCircle,
  FolderOpen,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { api, type RoadmapSummary } from '../lib/api';
import { recommendNext, type Suggestion } from '../lib/recommend';
import { SkeletonRoadmapList, LoadingAnnouncer } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

interface UpdateReport {
  checkedAt: string;
  remoteCount: number;
  newRoadmaps: string[];
  changed: { slug: string; reason: string }[];
  downloaded: string[];
}

function useUpdateReport() {
  const [report, setReport] = useState<UpdateReport | null>(null);
  useEffect(() => {
    fetch('/data/update-report.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => {});
  }, []);
  return report;
}

/** Compact relative time — "3d ago" reads faster than a date in a list. */
function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Recent {
  slug: string;
  topic: string;
  at: string;
}

/** The last roadmap you touched, per roadmap — "resume" beats "search again". */
function useRecentlyTouched(limit = 3) {
  const [recents, setRecents] = useState<Recent[]>([]);
  useEffect(() => {
    api
      .getActivity(100)
      .then((res) => {
        const seen = new Map<string, Recent>();
        for (const e of (res.events || [])) {
          if (!e?.slug || seen.has(e.slug)) continue;
          seen.set(e.slug, { slug: e.slug, topic: e.label || e.slug, at: e.at });
          if (seen.size >= limit) break;
        }
        setRecents([...seen.values()]);
      })
      .catch(() => setRecents([]));
  }, [limit]);
  return recents;
}

/**
 * Next-topic suggestions, derived from the graphs of roadmaps you have already
 * started. Only started roadmaps are fetched — walking all 97 would be wasteful
 * and "what next?" only means something for work in progress.
 */
function useSuggestions(summaries: RoadmapSummary[], limit = 3) {
  const [items, setItems] = useState<Suggestion[]>([]);
  useEffect(() => {
    const started = summaries.filter((s) => (s.doneCount || 0) > 0).slice(0, 8);
    if (!started.length) {
      setItems([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [full, prog] = await Promise.all([
          Promise.all(started.map((s) => api.getRoadmap(s.slug).catch(() => null))),
          api.getProgress(),
        ]);
        const maps = full.filter(Boolean) as Parameters<typeof recommendNext>[0];
        if (!alive) return;
        setItems(maps.length ? recommendNext(maps, prog.nodeProgress as never, limit) : []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [summaries, limit]);
  return items;
}

type FilterTab = 'all' | 'official' | 'custom' | 'in-progress' | 'mastered';

const pctOf = (r: RoadmapSummary) =>
  r.nodeCount ? Math.round(((r.doneCount || 0) / r.nodeCount) * 100) : 0;

export default function Home() {
  const [roadmaps, setRoadmaps] = useState<RoadmapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [error, setError] = useState<string | null>(null);
  const report = useUpdateReport();
  const recents = useRecentlyTouched();
  const suggestions = useSuggestions(roadmaps);

  useEffect(() => {
    let alive = true;
    api
      .listRoadmaps()
      .then((r) => {
        if (alive) setRoadmaps(r);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totals = useMemo(
    () => ({
      topics: roadmaps.reduce((a, r) => a + (r.nodeCount || 0), 0),
      done: roadmaps.reduce((a, r) => a + (r.doneCount || 0), 0),
    }),
    [roadmaps],
  );

  const filtered = useMemo(() => {
    let list = roadmaps;
    if (filterTab === 'official') list = list.filter((r) => !r.isCustom);
    if (filterTab === 'custom') list = list.filter((r) => r.isCustom);
    if (filterTab === 'in-progress')
      list = list.filter((r) => (r.doneCount || 0) > 0 && (r.doneCount || 0) < (r.nodeCount || 0));
    if (filterTab === 'mastered')
      list = list.filter((r) => (r.doneCount || 0) > 0 && r.doneCount === r.nodeCount);

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q),
    );
  }, [roadmaps, query, filterTab]);

  const custom = filtered.filter((r) => r.isCustom);
  const official = filtered.filter((r) => !r.isCustom);

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: roadmaps.length },
    { key: 'official', label: 'Official', count: roadmaps.filter((r) => !r.isCustom).length },
    { key: 'custom', label: 'Custom', count: roadmaps.filter((r) => r.isCustom).length },
    {
      key: 'in-progress',
      label: 'In progress',
      count: roadmaps.filter(
        (r) => (r.doneCount || 0) > 0 && (r.doneCount || 0) < (r.nodeCount || 0),
      ).length,
    },
    {
      key: 'mastered',
      label: 'Mastered',
      count: roadmaps.filter((r) => (r.doneCount || 0) > 0 && r.doneCount === r.nodeCount).length,
    },
  ];

  /** One roadmap = one row. 97 cards is a wall; 97 rows is a table of contents. */
  function renderRow(r: RoadmapSummary, i: number) {
    const pct = pctOf(r);
    const mastered = pct === 100 && (r.doneCount || 0) > 0;

    return (
      <div
        key={r.slug}
        className="row-hover group relative grid grid-cols-[2.25rem_1fr_auto] items-center gap-4 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        {/* Whole-row link to open roadmap. */}
        <Link
          to={`/roadmap/${encodeURIComponent(r.slug)}`}
          className="absolute inset-0 z-10"
          aria-label={`Open ${r.title}`}
        />

        <span
          className="tnum pointer-events-none font-mono text-[11px] tabular-nums"
          style={{ color: 'var(--theme-text-faint)' }}
          aria-hidden="true"
        >
          {String(i + 1).padStart(3, '0')}
        </span>

        <div className="pointer-events-none min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="t-small truncate font-medium transition-colors group-hover:text-[var(--theme-primary)]"
              style={{ color: 'var(--theme-text)' }}
            >
              {r.title}
            </span>
            {r.isCustom && (
              <span
                className="t-label shrink-0 rounded px-1.5 py-px"
                style={{
                  backgroundColor: 'var(--theme-note-soft)',
                  color: 'var(--theme-note)',
                }}
              >
                custom
              </span>
            )}
            {mastered && (
              <span
                className="t-label shrink-0 rounded px-1.5 py-px"
                style={{
                  backgroundColor: 'var(--theme-done-soft)',
                  color: 'var(--theme-done)',
                }}
              >
                mastered
              </span>
            )}
          </div>
          <p className="t-micro mt-0.5 truncate" style={{ color: 'var(--theme-text-faint)' }}>
            {r.description || `Career pathway and knowledge tree for ${r.title}.`}
          </p>
        </div>

        <div className="pointer-events-none flex shrink-0 items-center gap-3 sm:gap-4">
          <span
            className="tnum hidden font-mono text-[11px] sm:inline"
            style={{ color: 'var(--theme-text-faint)' }}
          >
            {r.doneCount || 0}/{r.nodeCount}
          </span>
          <span
            className="hidden h-1 w-20 overflow-hidden rounded-full sm:block"
            style={{ backgroundColor: 'var(--theme-border)' }}
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: mastered ? 'var(--theme-done)' : 'var(--theme-primary)',
                transitionTimingFunction: 'var(--ease-out)',
              }}
            />
          </span>
          <span
            className="tnum w-9 text-right font-mono text-[11px]"
            style={{ color: pct > 0 ? 'var(--theme-text)' : 'var(--theme-text-faint)' }}
          >
            {pct}%
          </span>
          <ArrowRight
            className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--theme-text-muted)' }}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }

  function renderSection(title: string, rows: RoadmapSummary[], count: number) {
    if (!rows.length) return null;
    return (
      <section className="mb-8">
        <div className="mb-1 flex items-baseline gap-2.5">
          <h2 className="t-heading" style={{ color: 'var(--theme-text)' }}>
            {title}
          </h2>
          <span className="tnum t-label" style={{ color: 'var(--theme-text-faint)' }}>
            {count}
          </span>
        </div>
        <div
          className="overflow-hidden rounded-xl"
          style={{
            backgroundColor: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
          }}
        >
          {rows.map(renderRow)}
        </div>
      </section>
    );
  }

  return (
    <div className="page">
      {/* Page header */}
      <header className="page-head">
        <h1 className="t-display page-title">
          Developer roadmaps
        </h1>
        <p className="t-body page-lede">
          Every curriculum you have saved, with your progress. Open one to pick up where you left
          off.
        </p>

        <dl className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-3">
          {[
            ['Roadmaps', roadmaps.length.toLocaleString()],
            ['Topics', totals.topics.toLocaleString()],
            ['Completed', totals.done.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2">
              <dt className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
                {label}
              </dt>
              <dd
                className="tnum font-mono text-[15px] font-medium"
                style={{ color: 'var(--theme-text)' }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {/* Resume shortcut. NeetCode surfaces where you are rather than making
          you re-find it — with 97 roadmaps that matters more, not less. */}
      {recents.length > 0 && (
        <section className="mb-8">
          <h2 className="t-heading mb-2" style={{ color: 'var(--theme-text)' }}>
            Pick up where you left off
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {recents.map((r) => {
              const rm = roadmaps.find((x) => x.slug === r.slug);
              const pct = rm ? pctOf(rm) : 0;
              return (
                <Link
                  key={r.slug}
                  to={`/roadmap/${encodeURIComponent(r.slug)}`}
                  className="flex flex-col rounded-xl p-4 transition-colors hover:bg-[var(--theme-hover-bg)]"
                  style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="t-small truncate font-medium"
                      style={{ color: 'var(--theme-text)' }}
                    >
                      {rm?.title || r.slug}
                    </span>
                    <span
                      className="t-micro shrink-0 font-mono"
                      style={{ color: 'var(--theme-text-faint)' }}
                    >
                      {timeAgo(r.at)}
                    </span>
                  </div>
                  <p className="t-micro mt-1 truncate" style={{ color: 'var(--theme-text-muted)' }}>
                    Last touched {r.topic}
                  </p>
                  <div className="mt-3 flex items-center gap-2.5">
                    <span
                      className="h-1 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: 'var(--theme-border)' }}
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--theme-primary)' }}
                      />
                    </span>
                    <span
                      className="tnum t-micro font-mono"
                      style={{ color: 'var(--theme-text-faint)' }}
                    >
                      {pct}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {error && (
        <div
          className="mb-6 flex items-start gap-2.5 rounded-xl px-4 py-3"
          style={{
            backgroundColor: 'var(--theme-danger-soft)',
            color: 'var(--theme-danger)',
            border: '1px solid var(--theme-danger)',
          }}
          role="alert"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="t-small">
            <span className="font-medium">Could not reach the local server.</span>{' '}
            <span className="opacity-80">{error}</span>
          </div>
        </div>
      )}

      {report && (report.newRoadmaps.length > 0 || report.changed.length > 0) && (
        <div
          className="mb-8 rounded-xl px-4 py-3.5"
          style={{
            backgroundColor: 'var(--theme-due-soft)',
            border: '1px solid var(--theme-due)',
          }}
        >
          <div className="flex items-start gap-2.5">
            <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--theme-due)' }} />
            <div className="min-w-0">
              <p className="t-small font-medium" style={{ color: 'var(--theme-text)' }}>
                Upstream roadmaps have changed
              </p>
              <p className="t-micro mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                {report.newRoadmaps.length > 0 && (
                  <>
                    {report.newRoadmaps.length} new ·{' '}
                    <span className="font-mono">{report.newRoadmaps.slice(0, 4).join(', ')}</span>
                    {report.newRoadmaps.length > 4 && ' …'}
                    {report.changed.length > 0 && ' — '}
                  </>
                )}
                {report.changed.length > 0 && `${report.changed.length} updated`}
                {' · checked '}
                {new Date(report.checkedAt).toLocaleDateString()}
              </p>
              <p className="t-micro mt-2 flex flex-wrap items-center gap-2" style={{ color: 'var(--theme-text-muted)' }}>
                <span>Sync with</span>
                <code
                  className="rounded px-1.5 py-0.5 font-mono text-[11px]"
                  style={{
                    backgroundColor: 'var(--theme-surface)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                >
                  npm run update:download
                </code>
                <span>· progress and notes are never touched.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Suggestions — derived from the graphs of roadmaps already started. */}
      {suggestions.length > 0 && (
        <section className="mb-8">
          <h2 className="t-heading mb-2" style={{ color: 'var(--theme-text)' }}>
            What to learn next
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {suggestions.map((s) => (
              <Link
                key={`${s.slug}:${s.nodeId}`}
                to={`/roadmap/${encodeURIComponent(s.slug)}?node=${encodeURIComponent(s.nodeId)}`}
                className="flex flex-col rounded-xl p-4 transition-colors hover:bg-[var(--theme-hover-bg)]"
                style={{ backgroundColor: 'var(--theme-surface)', border: '1px solid var(--theme-border)' }}
              >
                <span className="t-label truncate" style={{ color: 'var(--theme-text-faint)' }}>
                  {s.roadmapTitle}
                </span>
                <span
                  className="t-small mt-1 font-medium"
                  style={{ color: 'var(--theme-text)' }}
                >
                  {s.label}
                </span>
                <span className="t-micro mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                  {s.reason}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Toolbar — sticks under the nav so filters stay reachable on a long list */}
      <div
        className="bar sticky top-14 z-20 -mx-[clamp(1rem,3vw,1.5rem)] mb-4 flex flex-col gap-3 border-b px-[clamp(1rem,3vw,1.5rem)] py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div
          className="seg scrollbar-none overflow-x-auto"
          role="tablist"
          aria-label="Filter roadmaps"
        >
          {TABS.map((t) => {
            const on = filterTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilterTab(t.key)}
                className="seg-item"
              >
                {t.label}
                <span className="tnum font-mono text-[10px]" style={{ color: 'var(--theme-text-faint)' }}>
                  {loading ? '—' : t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="field-wrap w-full sm:w-64">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name…"
            className="field"
            aria-label="Filter roadmaps by name"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="btn btn-ghost btn-icon absolute right-1 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--theme-text-faint)' }}
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <>
          <LoadingAnnouncer label="Loading your roadmaps" />
          <div className="mb-1 flex items-baseline gap-2.5">
            <span className="skeleton skeleton-line" style={{ width: '9rem', height: '1.05rem' }} aria-hidden="true" />
          </div>
          <SkeletonRoadmapList rows={9} />
        </>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={query ? `Nothing matches “${query}”` : 'No roadmaps in this category'}
          description={
            query
              ? 'Try a shorter term, or clear the filter to see everything in your library.'
              : 'Switch back to All to see your full library.'
          }
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setQuery('');
                setFilterTab('all');
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Show all roadmaps
            </button>
          }
        />
      ) : (
        <>
          {renderSection('Your roadmaps', custom, custom.length)}
          {renderSection('Official curricula', official, official.length)}
        </>
      )}
    </div>
  );
}
