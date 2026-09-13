import { useEffect, useRef, useState } from 'react';
import { BookOpen, Bookmark, FileText, Code2, Video, Map, ExternalLink, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import type { RMNode } from '../lib/types';
import NotesEditor from './NotesEditor';
import TimeTracker from './TimeTracker';
import CodePlayground from './CodePlayground';
import EmptyState from './EmptyState';
import { SkeletonBar, SkeletonText, LoadingAnnouncer } from './Skeleton';

interface CustomBookmark {
  id: string;
  title: string;
  url: string;
  timestamp?: string;
}

/** Render the official `[@label@url]` resource links as a list. */
function OfficialLinks({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n').filter((l) => l.trim().startsWith('- [@'));
  if (!lines.length) return null;
  return (
    <div className="mt-4">
      <h3 className="font-bold mb-2 text-xs uppercase tracking-wide text-ink-muted">Official Resources</h3>
      <ul className="space-y-2">
        {lines.map((line, i) => {
          const m = line.match(/-\s*\[@(\w+)@([^\]]+)\]/);
          if (!m) return null;
          const kind = m[1];
          const rest = m[2];
          const li = rest.lastIndexOf('@');
          const label = li >= 0 ? rest.slice(0, li) : rest;
          const url = li >= 0 ? rest.slice(li + 1) : '';
          const IconComponent = kind === 'video' ? Video : kind === 'course' ? BookOpen : kind === 'roadmap' ? Map : ExternalLink;
          return (
            <li key={i}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-2 text-xs hover:underline leading-relaxed"
                style={{ color: 'var(--theme-primary)' }}
              >
                <IconComponent className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Props {
  slug: string;
  node: RMNode | null;
  defaultTab?: 'resources' | 'notes' | 'sandbox';
  onClose: () => void;
}

export default function ResourcesPanel({ slug, node, defaultTab, onClose }: Props) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'resources' | 'notes' | 'sandbox'>(defaultTab || 'resources');

  // Custom Bookmarks & Video Timestamps
  const [bookmarks, setBookmarks] = useState<CustomBookmark[]>([]);
  const [bmTitle, setBmTitle] = useState('');
  const [bmUrl, setBmUrl] = useState('');
  const [bmTimestamp, setBmTimestamp] = useState('');
  const [showAddBm, setShowAddBm] = useState(false);

  useEffect(() => {
    setActiveTab(defaultTab || 'resources');
  }, [defaultTab, node]);

  // Load custom bookmarks from localStorage
  useEffect(() => {
    if (!node) {
      setBookmarks([]);
      return;
    }
    try {
      const saved = localStorage.getItem(`rm_bm_${slug}_${node.id}`);
      if (saved) setBookmarks(JSON.parse(saved));
      else setBookmarks([]);
    } catch {
      setBookmarks([]);
    }
  }, [slug, node]);

  function saveBookmark(e: React.FormEvent) {
    e.preventDefault();
    if (!node || !bmTitle.trim() || !bmUrl.trim()) return;

    let finalUrl = bmUrl.trim();
    if (bmTimestamp.trim()) {
      // Support mm:ss or seconds
      let sec = 0;
      if (bmTimestamp.includes(':')) {
        const [m, s] = bmTimestamp.split(':').map(Number);
        sec = (m || 0) * 60 + (s || 0);
      } else {
        sec = Number(bmTimestamp) || 0;
      }
      if (sec > 0) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `t=${sec}s`;
      }
    }

    const next = [
      ...bookmarks,
      {
        id: `bm-${Date.now()}`,
        title: bmTitle.trim(),
        url: finalUrl,
        timestamp: bmTimestamp.trim() || undefined,
      },
    ];
    setBookmarks(next);
    localStorage.setItem(`rm_bm_${slug}_${node.id}`, JSON.stringify(next));
    setBmTitle('');
    setBmUrl('');
    setBmTimestamp('');
    setShowAddBm(false);
  }

  function deleteBookmark(id: string) {
    if (!node) return;
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next);
    localStorage.setItem(`rm_bm_${slug}_${node.id}`, JSON.stringify(next));
  }

  useEffect(() => {
    if (!node) {
      setMarkdown(null);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .getNodeContent(slug, node.id)
      .then((r) => alive && setMarkdown(r.content))
      .catch(() => alive && setMarkdown(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slug, node]);

  // Escape key dismisses the panel
  useEffect(() => {
    if (!node) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [node, onClose]);

  // Move focus into the drawer when it opens and restore it on close. This hook
  // must stay ABOVE the early return below: a hook after an early return runs on
  // a different number of renders and throws React error #310.
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  useEffect(() => {
    if (!node) return;
    restoreTo.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, [node]);

  if (!node) return null;

  // Strip resource links and redundant leading `# Topic Title` from body text (they render in header/OfficialLinks)
  const rawLines = (markdown || '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('- [@'));
  if (rawLines.length && rawLines[0].trim().startsWith('#')) {
    rawLines.shift();
  }
  const body = rawLines.join('\n').trim();

  return (
    <>
      <div
        className="fixed inset-0 z-35 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        style={{ backgroundColor: 'var(--theme-scrim)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="no-focus-ring fixed inset-y-0 right-0 z-40 flex w-full max-w-md select-none flex-col border-l shadow-2xl animate-in slide-in-from-right duration-200"
        style={{ backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Resources for ${node.data?.label || node.id}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <h2 className="font-bold text-base truncate pr-4" style={{ color: 'var(--theme-text)' }}>
            {node.data?.label || node.id}
          </h2>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ color: 'var(--theme-text-muted)' }}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stitch Segmented Tabs */}
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--theme-border)' }}>
          <div
            className="flex items-center gap-1 p-1 rounded-full border shadow-2xs"
            style={{ backgroundColor: 'var(--theme-surface-soft)', borderColor: 'var(--theme-border)' }}
          >
            {(
              [
                ['resources', 'Resources', BookOpen],
                ['notes', 'Notes', FileText],
                ['sandbox', 'Sandbox', Code2],
              ] as const
            ).map(([tab, label, Icon]) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-1.5 min-h-[34px] rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 text-center whitespace-nowrap"
                  style={{
                    backgroundColor: isActive ? 'var(--theme-primary)' : 'transparent',
                    color: isActive ? 'var(--theme-primary-ink)' : 'var(--theme-text-muted)',
                    boxShadow: isActive ? 'var(--theme-shadow)' : 'none',
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="py-1">
            <LoadingAnnouncer label="Loading topic content" />
            <SkeletonText lines={3} />
            <div className="mt-5 flex flex-col gap-2">
              <SkeletonBar width="7rem" height="0.6rem" />
              <SkeletonBar width="82%" height="1.6rem" />
              <SkeletonBar width="64%" height="1.6rem" />
            </div>
          </div>
        ) : (
          <>
            {/* Resources & Bookmarks Tab */}
            {activeTab === 'resources' && (
              <div className="space-y-4">
                {body ? (
                  <div
                    className="text-xs leading-relaxed whitespace-pre-wrap select-text opacity-90"
                    style={{ color: 'var(--theme-text)' }}
                  >
                    {body}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<FileText className="h-5 w-5" />}
                    title="No guide text for this topic"
                    description="The official roadmap ships no prose for this node. Use the links below, or write your own notes in the Notes tab."
                  />
                )}

                {markdown && <OfficialLinks markdown={markdown} />}

                {/* Personal Bookmarks & Video Timestamps */}
                <div className="mt-6 border-t pt-4 border-line">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-xs uppercase tracking-wide text-ink-muted">
                      🔖 My Bookmarks & Timestamps
                    </h3>
                    <button
                      onClick={() => setShowAddBm(!showAddBm)}
                      className="text-xs font-semibold text-learning hover:underline cursor-pointer"
                    >
                      {showAddBm ? 'Cancel' : '+ Add Link'}
                    </button>
                  </div>

                  {showAddBm && (
                    <form onSubmit={saveBookmark} className="mb-3 p-3 bg-raised rounded-xl border border-line space-y-2 text-xs">
                      <input
                        type="text"
                        aria-label="Bookmark title"
                        placeholder="Link title (e.g. YouTube Walkthrough)"
                        value={bmTitle}
                        onChange={(e) => setBmTitle(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded border border-line bg-surface text-ink"
                      />
                      <input
                        type="url"
                        aria-label="Bookmark URL"
                        placeholder="https://..."
                        value={bmUrl}
                        onChange={(e) => setBmUrl(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded border border-line bg-surface text-ink"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label="Bookmark timestamp"
                          placeholder="Timestamp (e.g. 04:30 or 120s)"
                          value={bmTimestamp}
                          onChange={(e) => setBmTimestamp(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 rounded border border-line bg-surface text-ink"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 bg-learning hover:bg-learning on-accent font-semibold rounded cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  )}

                  {bookmarks.length > 0 ? (
                    <ul className="space-y-1.5">
                      {bookmarks.map((bm) => (
                        <li
                          key={bm.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-raised/80 border border-line text-xs"
                        >
                          <a
                            href={bm.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-learning hover:underline truncate"
                          >
                            <span>🔗</span>
                            <span className="truncate">{bm.title}</span>
                            {bm.timestamp && (
                              <span className="px-1.5 py-0.2 rounded bg-learning-soft text-[10px] font-mono font-bold text-learning">
                                ⏱️ {bm.timestamp}
                              </span>
                            )}
                          </a>
                          <button
                            onClick={() => deleteBookmark(bm.id)}
                            className="text-ink-faint hover:text-danger text-[11px] p-0.5 cursor-pointer"
                            title="Delete bookmark"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      compact
                      icon={<Bookmark className="h-5 w-5" />}
                      title="No bookmarks yet"
                      description="Save documentation links or video timestamps against this topic so they are one click away next time."
                      action={
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowAddBm(true)}>
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add a link
                        </button>
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* Notes & Time Tracker Tab */}
            {activeTab === 'notes' && (
              <div className="space-y-4">
                <NotesEditor slug={slug} nodeId={node.id} />
                <TimeTracker slug={slug} nodeId={node.id} />
              </div>
            )}

            {/* In-Browser Web Worker Code Sandbox Tab */}
            {activeTab === 'sandbox' && (
              <div className="h-full">
                <CodePlayground topicLabel={node.data?.label || node.id} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
