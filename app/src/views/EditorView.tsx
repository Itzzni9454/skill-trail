import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  FilePlus2,
  GitFork,
  Link2,
  Loader2,
  MousePointer2,
  PencilLine,
  Plus,
  Redo2,
  Save,
  Trash2,
  TriangleAlert,
  Undo2,
  Workflow,
} from 'lucide-react';
import { api } from '../lib/api';
import type { RMEdge, RMNode, Roadmap } from '../lib/types';
import RoadmapSVG from '../components/RoadmapSVG';
import PanZoom from '../components/PanZoom';
import MermaidImportModal from '../components/MermaidImportModal';
import EmptyState from '../components/EmptyState';

const NEW_NODE_COST = { x: 60, y: 120 };

function uid(): string {
  return 'c' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

type Tool = 'select' | 'add-topic' | 'add-subtopic' | 'connect' | 'delete';

interface HistorySnapshot {
  nodes: RMNode[];
  edges: RMEdge[];
}

export default function EditorView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [title, setTitle] = useState('');
  const [allCustom, setAllCustom] = useState<{ slug: string; title: string }[]>([]);
  const [allOfficial, setAllOfficial] = useState<{ slug: string; title: string }[]>([]);
  const [forkTarget, setForkTarget] = useState('');
  const [forking, setForking] = useState(false);
  const [mermaidOpen, setMermaidOpen] = useState(false);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Record a history snapshot
  const pushHistory = useCallback((nodes: RMNode[], edges: RMEdge[]) => {
    setHistory((prev) => {
      const upToCurrent = prev.slice(0, historyIndex + 1);
      return [...upToCurrent, { nodes, edges }];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setRoadmap((rm) => (rm ? { ...rm, nodes: target.nodes, edges: target.edges } : rm));
      setHistoryIndex((i) => i - 1);
      setSaveState('idle');
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setRoadmap((rm) => (rm ? { ...rm, nodes: target.nodes, edges: target.edges } : rm));
      setHistoryIndex((i) => i + 1);
      setSaveState('idle');
    }
  }, [history, historyIndex]);

  // Keyboard shortcut listener for Ctrl+Z and Ctrl+Y
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // load custom + official roadmap lists
  const refreshList = useCallback(() => {
    api.listRoadmaps().then((list) => {
      setAllCustom(list.filter((r) => r.isCustom).map((r) => ({ slug: r.slug, title: r.title })));
      setAllOfficial(list.filter((r) => !r.isCustom).map((r) => ({ slug: r.slug, title: r.title })));
      setForkTarget((cur) => cur || list.find((r) => !r.isCustom)?.slug || '');
    }).catch(() => {});
  }, []);
  useEffect(refreshList, [refreshList]);

  async function forkOfficial() {
    if (!forkTarget) return;
    setForking(true);
    try {
      const rm = await api.forkCustomRoadmap(forkTarget);
      refreshList();
      navigate(`/editor/${encodeURIComponent('custom:' + rm.slug!)}`);
    } catch {
      alert('Failed to fork roadmap. Is the server running?');
    } finally {
      setForking(false);
    }
  }

  // load roadmap into editor
  useEffect(() => {
    if (!slug) {
      setRoadmap(null);
      setHistory([]);
      setHistoryIndex(-1);
      return;
    }
    api.getRoadmap(slug).then((rm) => {
      setRoadmap(rm);
      setTitle(rm.title?.page || '');
      setHistory([{ nodes: rm.nodes || [], edges: rm.edges || [] }]);
      setHistoryIndex(0);
    }).catch(() => setRoadmap(null));
  }, [slug]);

  const nodeById = useMemo(() => new Map((roadmap?.nodes || []).map((n) => [n.id, n])), [roadmap]);

  function createNew() {
    const t = prompt('Name your roadmap:');
    if (!t) return;
    api.createCustomRoadmap(t, '').then((rm) => {
      refreshList();
      navigate(`/editor/${encodeURIComponent('custom:' + rm.slug!)}`);
    });
  }

  function setNodes(nodes: RMNode[]) {
    if (!roadmap) return;
    setRoadmap((rm) => (rm ? { ...rm, nodes } : rm));
    pushHistory(nodes, roadmap.edges);
    setSaveState('idle');
  }

  function addNode(type: 'topic' | 'subtopic') {
    if (!roadmap) return;
    const label = prompt(type === 'topic' ? 'Topic name:' : 'Subtopic name:');
    if (!label) return;
    const n: RMNode = {
      id: uid(),
      type,
      position: { ...NEW_NODE_COST },
      width: 240,
      height: 49,
      data: { label, style: { fontSize: 17 } },
    };
    const nextNodes = [...roadmap.nodes, n];
    setRoadmap((rm) => (rm ? { ...rm, nodes: nextNodes } : rm));
    pushHistory(nextNodes, roadmap.edges);
    setSelectedNode(n.id);
    setSaveState('idle');
  }

  function deleteSelected() {
    if (!roadmap || !selectedNode) return;
    const nextNodes = roadmap.nodes.filter((n) => n.id !== selectedNode);
    const nextEdges = roadmap.edges.filter((e) => e.source !== selectedNode && e.target !== selectedNode);
    setRoadmap((rm) => (rm ? { ...rm, nodes: nextNodes, edges: nextEdges } : rm));
    pushHistory(nextNodes, nextEdges);
    setSelectedNode(null);
    setSaveState('idle');
  }

  function handleNodeClick(node: RMNode) {
    if (tool === 'connect') {
      if (!connectFrom) {
        setConnectFrom(node.id);
        return;
      }
      if (connectFrom !== node.id && roadmap) {
        const edge: RMEdge = {
          id: uid(),
          source: connectFrom,
          target: node.id,
          sourceHandle: 'z2',
          targetHandle: 'w2',
        };
        const nextEdges = [...roadmap.edges, edge];
        setRoadmap((rm) => (rm ? { ...rm, edges: nextEdges } : rm));
        pushHistory(roadmap.nodes, nextEdges);
        setConnectFrom(null);
        setSaveState('idle');
      }
      return;
    }
    if (tool === 'delete') {
      setSelectedNode(node.id);
      deleteSelected();
      return;
    }
    setSelectedNode(node.id);
  }

  function editSelected() {
    if (!roadmap || !selectedNode) return;
    const n = nodeById.get(selectedNode);
    if (!n) return;
    const label = prompt('New label:', n.data?.label || '');
    if (label === null) return;
    const nextNodes = roadmap.nodes.map((x) => (x.id === selectedNode ? { ...x, data: { ...x.data, label } } : x));
    setRoadmap((rm) => (rm ? { ...rm, nodes: nextNodes } : rm));
    pushHistory(nextNodes, roadmap.edges);
    setSaveState('idle');
  }

  function handleMermaidImport(importedNodes: RMNode[], importedEdges: RMEdge[]) {
    if (!roadmap) return;
    const nextNodes = [...roadmap.nodes, ...importedNodes];
    const nextEdges = [...roadmap.edges, ...importedEdges];
    setRoadmap((rm) => (rm ? { ...rm, nodes: nextNodes, edges: nextEdges } : rm));
    pushHistory(nextNodes, nextEdges);
    setSaveState('idle');
  }

  async function save() {
    if (!roadmap) return;
    setSaveState('saving');
    try {
      await api.saveCustomRoadmap(slug!.replace(/^custom:/, ''), {
        title,
        nodes: roadmap.nodes,
        edges: roadmap.edges,
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  async function removeRoadmap() {
    if (!roadmap || !confirm('Delete this custom roadmap?')) return;
    await api.deleteCustomRoadmap(slug!.replace(/^custom:/, ''));
    refreshList();
    navigate('/editor');
  }

  const isCustom = !!slug?.startsWith('custom:');
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col" style={{ backgroundColor: 'var(--theme-bg)' }}>
      {/* toolbar */}
      <div
        className="bar flex flex-wrap items-center gap-2 border-b px-4 py-2 z-10"
        style={{ color: 'var(--theme-text)' }}
      >
        <select
          className="field w-auto"
          style={{ maxWidth: '13rem' }}
          value={slug || ''}
          onChange={(e) => navigate(`/editor/${encodeURIComponent(e.target.value)}`)}
          aria-label="Open a custom roadmap"
        >
          <option value="">— Open custom roadmap —</option>
          {allCustom.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={createNew}>
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
          New custom roadmap
        </button>

        <span className="divider mx-1 h-6 w-px" aria-hidden="true" />
        <select
          className="field w-auto"
          style={{ maxWidth: '14rem' }}
          value={forkTarget}
          onChange={(e) => setForkTarget(e.target.value)}
          aria-label="Choose an official roadmap to fork"
        >
          {allOfficial.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={forkOfficial}
          disabled={forking || !forkTarget}
        >
          {forking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {forking ? 'Forking…' : 'Fork official → editable copy'}
        </button>

        {roadmap && (
          <>
            <span className="divider mx-1 h-6 w-px" aria-hidden="true" />
            {/* Undo / Redo controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className="btn btn-quiet btn-icon"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className="btn btn-quiet btn-icon"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <span className="divider mx-1 h-6 w-px" aria-hidden="true" />
            {/* Tool picker — one shape, colour only on the armed tool. Emoji
                glyphs were replaced with icons: they rendered at inconsistent
                sizes and read as decoration in an otherwise exact toolbar. */}
            <div className="seg" role="radiogroup" aria-label="Editing tool">
              {(
                [
                  ['select', 'Select', MousePointer2],
                  ['add-topic', 'Topic', Plus],
                  ['add-subtopic', 'Subtopic', Plus],
                  ['connect', 'Connect', Link2],
                  ['delete', 'Delete', Trash2],
                ] as [Tool, string, typeof Plus][]
              ).map(([t, label, Icon]) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tool === t}
                  className="seg-item"
                  onClick={() => {
                    setTool(t);
                    setConnectFrom(null);
                    if (t === 'add-topic') addNode('topic');
                    if (t === 'add-subtopic') addNode('subtopic');
                  }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!selectedNode}
              onClick={editSelected}
            >
              <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              Rename
            </button>

            {/* Mermaid Importer button */}
            <button
              type="button"
              onClick={() => setMermaidOpen(true)}
              className="btn btn-quiet"
              title="Import nodes from Mermaid markdown"
            >
              <Workflow className="h-3.5 w-3.5" style={{ color: 'var(--theme-accent)' }} aria-hidden="true" />
              Mermaid
            </button>

            <span className="divider mx-1 h-6 w-px" aria-hidden="true" />
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveState('idle');
              }}
              className="field w-44"
              placeholder="Roadmap title"
              aria-label="Roadmap title"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!isCustom || saveState === 'saving'}
            >
              {saveState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-danger" onClick={removeRoadmap}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </button>
            {/* Save state is a status, not decoration — announce it politely. */}
            <span
              className="t-micro ml-auto flex items-center gap-1.5"
              role="status"
              aria-live="polite"
              style={{ color: saveState === 'error' ? 'var(--theme-danger)' : 'var(--theme-text-faint)' }}
            >
              {saveState === 'saved' && (
                <>
                  <Check className="h-3.5 w-3.5" style={{ color: 'var(--theme-done)' }} aria-hidden="true" />
                  Saved
                </>
              )}
              {saveState === 'error' && (
                <>
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Save failed
                </>
              )}
              {connectFrom && 'Pick a target node to connect'}
            </span>
          </>
        )}
      </div>

      {/* official-roadmap warning banner */}
      {roadmap && !isCustom && (
        <div
          className="flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
          style={{
            backgroundColor: 'var(--theme-due-soft)',
            borderColor: 'color-mix(in oklab, var(--theme-due) 32%, transparent)',
            color: 'var(--theme-due)',
          }}
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This is an <b>official</b> roadmap — it is read-only so official updates keep flowing.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            disabled={forking}
            onClick={async () => {
              const rm = await api.forkCustomRoadmap(roadmap.slug || '');
              refreshList();
              navigate(`/editor/${encodeURIComponent('custom:' + rm.slug!)}`);
            }}
          >
            <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
            {forking ? 'Forking…' : 'Fork it to edit'}
          </button>
        </div>
      )}

      {/* canvas */}
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--theme-bg)' }}>
        {!roadmap ? (
          <div className="grid h-full place-items-center px-6">
            <EmptyState
              className="w-full max-w-lg"
              icon={<Workflow className="h-5 w-5" />}
              title="Nothing open in the editor"
              description="Create a blank roadmap, or fork any official one to get an editable copy you can rearrange."
              action={
                <>
                  <button type="button" className="btn btn-primary" onClick={createNew}>
                    <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                    New custom roadmap
                  </button>
                  {forkTarget && (
                    <button type="button" className="btn btn-quiet" onClick={forkOfficial} disabled={forking}>
                      <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
                      Fork {allOfficial.find((r) => r.slug === forkTarget)?.title ?? 'official'}
                    </button>
                  )}
                </>
              }
            />
          </div>
        ) : (
          <PanZoom>
            <RoadmapSVG
              roadmap={roadmap}
              progress={{}}
              editable
              onNodesChange={setNodes}
              selectedNodeId={selectedNode}
              onNodeClick={handleNodeClick}
            />
          </PanZoom>
        )}
      </div>

      <MermaidImportModal
        isOpen={mermaidOpen}
        onClose={() => setMermaidOpen(false)}
        onImport={handleMermaidImport}
      />
    </div>
  );
}
