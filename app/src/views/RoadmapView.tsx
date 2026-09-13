import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Compass, Layers, RotateCw, Shield, Edit3, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import type { NodeStatus, ProgressMap, RMNode, Roadmap } from '../lib/types';
import { isInteractiveType } from '../lib/renderer';
import { useCrossProgress } from '../lib/useCrossProgress';
import RoadmapSVG from '../components/RoadmapSVG';
import NodePopup from '../components/NodePopup';
import ResourcesPanel from '../components/ResourcesPanel';
import PanZoom from '../components/PanZoom';
import { ProgressBand } from '../components/ProgressSegments';
import BadgeModal from '../components/BadgeModal';
import FlashcardModal from '../components/FlashcardModal';
import { SkeletonBar, SkeletonCanvas, LoadingAnnouncer } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';

export default function RoadmapView() {
  const { slug = '' } = useParams();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [popup, setPopup] = useState<{ node: RMNode; x: number; y: number } | null>(null);
  const [resourceNode, setResourceNode] = useState<RMNode | null>(null);
  const [resourceTab, setResourceTab] = useState<'resources' | 'notes'>('resources');
  const [highlightPath, setHighlightPath] = useState(false);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const roadmapFlashcards = useMemo(() => {
    if (!roadmap) return [];
    return roadmap.nodes
      .filter((n) => ['topic', 'subtopic'].includes(n.type))
      .map((n) => ({
        slug,
        nodeId: n.id,
        label: n.data?.label || n.id,
        stage: 0,
        dueAt: new Date().toISOString(),
        roadmapTitle: roadmap.title?.page || slug,
      }));
  }, [roadmap, slug]);

  // Cross-roadmap coverage lives in a shared hook (also used by MindmapView).

  const [searchParams, setSearchParams] = useSearchParams();
  const focusNodeId = searchParams.get('node');
  const pannedToRef = useRef<string | null>(null);

  async function openEditor() {
    if (!roadmap) return;
    if (roadmap.isCustom) {
      navigate(`/editor/${encodeURIComponent(slug)}`);
      return;
    }
    try {
      const fork = await api.forkCustomRoadmap(slug);
      navigate(`/editor/${encodeURIComponent('custom:' + fork.slug!)}`);
    } catch {
      alert('Failed to fork roadmap. Is the server running?');
    }
  }

  useEffect(() => {
    setRoadmap(null);
    setPopup(null);
    setResourceNode(null);
    setError(null);
    Promise.all([api.getRoadmap(slug), api.getProgress()])
      .then(([rm, prog]) => {
        setRoadmap(rm);
        setProgress((prog.nodeProgress[slug] as ProgressMap) || {});
      })
      .catch((e) => setError(String(e)));
  }, [slug]);

  const { displayProgress, coveredBy, refreshCoverage, effectiveCount } = useCrossProgress(slug, roadmap, progress);

  const stats = useMemo(() => {
    const interactive = (roadmap?.nodes || []).filter(isInteractiveType);
    let total = 0;
    let done = 0;
    let covered = 0;
    let learning = 0;
    let skipped = 0;

    const tally = (st?: string) => {
      if (st === 'done') done++;
      else if (st === 'covered' && effectiveCount) covered++;
      else if (st === 'learning') learning++;
      else if (st === 'skipped') skipped++;
    };

    for (const n of interactive) {
      if (n.type === 'checklist' && Array.isArray(n.data?.checklists) && n.data.checklists.length) {
        total += n.data.checklists.length;
        for (const item of n.data.checklists) tally(displayProgress[item.id]);
      } else {
        total += 1;
        tally(displayProgress[n.id]);
      }
    }

    return {
      total,
      done,
      covered,
      learning,
      skipped,
      pct: total ? Math.round(((done + covered) / total) * 100) : 0,
    };
  }, [roadmap, displayProgress, effectiveCount]);

  // Deep-link support: /roadmap/:slug?node=<id> opens that node's popup once.
  // (Used by the global search palette.)
  useEffect(() => {
    if (!roadmap || !focusNodeId || pannedToRef.current === focusNodeId) return;
    const target = roadmap.nodes.find((n) => n.id === focusNodeId);
    if (!target) return;
    pannedToRef.current = focusNodeId;
    setPopup({ node: target, x: window.innerWidth / 2, y: window.innerHeight / 3 });
    setSearchParams({}, { replace: true });
  }, [roadmap, focusNodeId, setSearchParams]);

  async function setStatus(nodeId: string, status: NodeStatus | null) {
    setProgress((p) => {
      const next = { ...p };
      if (status) next[nodeId] = status;
      else delete next[nodeId];
      return next;
    });
    await api.setNodeStatus(slug, nodeId, status);
    // cross-roadmap coverage may have changed (this topic may now be done)
    refreshCoverage();
  }

  async function handleChecklistToggle(itemId: string) {
    const isDone = displayProgress[itemId] === 'done';
    await setStatus(itemId, isDone ? null : 'done');
  }

  if (error)
    return (
      <div className="grid h-[70vh] place-items-center px-6">
        <EmptyState
          tone="danger"
          role="alert"
          icon={<TriangleAlert className="h-5 w-5" />}
          title="Could not load this roadmap"
          description={
            <>
              {error} — the local server may not be running. Start it with{' '}
              <code className="font-mono">npm start</code> in <code className="font-mono">server/</code>.
            </>
          }
          action={
            <>
              <Link to="/" className="btn btn-primary">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back to all roadmaps
              </Link>
              <button type="button" className="btn btn-quiet" onClick={() => window.location.reload()}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </>
          }
        />
      </div>
    );
  if (!roadmap)
    return (
      <div
        className="flex h-[calc(100vh-3.5rem)] flex-col"
        style={{ backgroundColor: 'var(--theme-bg)' }}
      >
        <LoadingAnnouncer label={`Loading ${slug}`} />
        {/* Mirror the real toolbar so the header does not jump when data lands. */}
        <div className="bar flex items-center gap-2.5 border-b px-4 py-2.5 sm:px-6" aria-hidden="true">
          <SkeletonBar width="4.5rem" height="1.4rem" />
          <SkeletonBar width="11rem" height="1rem" />
          <div className="flex-1" />
          <SkeletonBar width="5.5rem" height="1.9rem" />
          <SkeletonBar width="5.5rem" height="1.9rem" />
          <SkeletonBar width="5.5rem" height="1.9rem" />
        </div>
        <div className="border-b px-4 py-2.5 sm:px-6" style={{ borderColor: 'var(--theme-border)' }}>
          <SkeletonBar width="100%" height="0.3rem" />
        </div>
        <div className="flex-1 overflow-hidden">
          <SkeletonCanvas />
        </div>
      </div>
    );

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col" style={{ backgroundColor: 'var(--theme-bg)' }}>
      {/* Subheader Toolbar */}
      <div
        className="bar flex flex-wrap items-center gap-2.5 border-b px-4 py-2.5 shadow-2xs sm:px-6 z-10"
        style={{ color: 'var(--theme-text)' }}
      >
        <Link to="/" className="btn btn-ghost btn-sm">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">All maps</span>
          <span className="sr-only sm:hidden">All maps</span>
        </Link>
        <h1 className="t-heading truncate" style={{ color: 'var(--theme-text)' }}>
          {roadmap.title?.page || slug}
        </h1>

        <span className="divider mx-1 hidden h-4 w-px sm:block" aria-hidden="true" />

        {/* Toolbar controls share one shape and one neutral icon colour; only the
            active state earns colour. */}
        <button
          type="button"
          className={`btn btn-sm ${highlightPath ? 'btn-on' : 'btn-quiet'}`}
          onClick={() => setHighlightPath((h) => !h)}
          aria-pressed={highlightPath}
          title="Emphasise the topics on your current learning path"
        >
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden lg:inline">Learning path</span>
          <span className="sr-only lg:hidden">Learning path</span>
        </button>

        <button
          type="button"
          onClick={() => setQuizOpen(true)}
          className="btn btn-quiet btn-sm"
          title="Practice active recall for this roadmap"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Flashcards</span>
          <span className="sr-only xl:hidden">Flashcards</span>
        </button>

        <button
          type="button"
          onClick={() => setBadgeModalOpen(true)}
          className="btn btn-quiet btn-sm"
          title="Embed a GitHub badge or export an Anki deck"
        >
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">Badge &amp; Anki</span>
          <span className="sr-only xl:hidden">Badge and Anki</span>
        </button>

        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={openEditor}
          title={roadmap.isCustom ? 'Edit this roadmap' : 'Fork into a custom roadmap'}
        >
          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">{roadmap.isCustom ? 'Edit' : 'Fork'}</span>
          <span className="sr-only xl:hidden">{roadmap.isCustom ? 'Edit' : 'Fork'}</span>
        </button>

        <div className="flex-1" />

        {/* Progress lives in the band below the toolbar — a small pill here
            competed with the controls and duplicated the same numbers. */}
      </div>

      {/* Progress band: the *mix* of states is what matters, not just a
          percentage, so each stage gets its own segment of the track. */}
      <ProgressBand
        parts={{
          done: stats.done,
          learning: stats.learning,
          skipped: stats.skipped,
          covered: stats.covered,
          total: stats.total,
        }}
        pct={stats.pct}
      />
      {/* canvas */}
      <div className="flex-1 overflow-hidden">
        <PanZoom onBackgroundClick={() => setPopup(null)}>
          <RoadmapSVG
            roadmap={roadmap}
            progress={displayProgress}
            highlightPath={highlightPath}
            onNodeClick={(node, e) => setPopup({ node, x: e.clientX, y: e.clientY })}
            onChecklistToggle={handleChecklistToggle}
          />
        </PanZoom>
      </div>

      {/* node popup */}
      {popup && (
        <NodePopup
          node={popup.node}
          x={popup.x}
          y={popup.y}
          progress={displayProgress}
          coveredBy={coveredBy(popup.node.data?.label)}
          onSetStatus={(s) => setStatus(popup.node.id, s)}
          onOpenResources={() => {
            setResourceNode(popup.node);
            setResourceTab('resources');
            setPopup(null);
          }}
          onOpenNotes={() => {
            setResourceNode(popup.node);
            setResourceTab('notes');
            setPopup(null);
          }}
          onClose={() => setPopup(null)}
        />
      )}

      {/* resources drawer */}
      <ResourcesPanel slug={slug} node={resourceNode} defaultTab={resourceTab} onClose={() => setResourceNode(null)} />

      <BadgeModal
        isOpen={badgeModalOpen}
        onClose={() => setBadgeModalOpen(false)}
        slug={slug}
        title={roadmap.title?.page || slug}
      />

      <FlashcardModal
        isOpen={quizOpen}
        items={roadmapFlashcards}
        onClose={() => setQuizOpen(false)}
      />
    </div>
  );
}
