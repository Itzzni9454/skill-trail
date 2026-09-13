import { useState } from 'react';
import { AlertTriangle, Brain, ChartColumn, Sparkles, Workflow } from 'lucide-react';
import { parseMermaidToRoadmap } from '../lib/mermaidParser';
import type { RMEdge, RMNode } from '../lib/types';
import ModalShell from './ModalShell';

const SAMPLE_FLOWCHART = `graph TD
  A[Frontend Architecture] --> B[HTML & Semantic DOM]
  A --> C[Modern CSS & Tailwind]
  B --> D[JavaScript & TypeScript]
  C --> D
  D --> E[React & Virtual DOM]
  D --> F[Vue & Reactivity]
  E --> G[Next.js SSR/SSG]
  E --> H[State Management]`;

const SAMPLE_MINDMAP = `mindmap
  root((Fullstack Roadmap))
    Frontend
      HTML and CSS
      JavaScript ES6+
      React Components
    Backend
      Node.js Express
      PostgreSQL
      REST APIs
    DevOps
      Docker
      GitHub Actions`;

export default function MermaidImportModal({
  isOpen,
  onClose,
  onImport,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (nodes: RMNode[], edges: RMEdge[]) => void;
}) {
  const [code, setCode] = useState(SAMPLE_FLOWCHART);
  const [mode, setMode] = useState<'replace' | 'append'>('append');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    try {
      setError(null);
      const parsed = parseMermaidToRoadmap(code);
      if (parsed.nodes.length === 0) {
        setError('No valid nodes found in the provided Mermaid code.');
        return;
      }
      onImport(parsed.nodes, parsed.edges);
      onClose();
    } catch (err) {
      setError('Failed to parse Mermaid syntax: ' + String(err));
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      label="Import from Mermaid"
      title="Import from Mermaid.js"
      subtitle="Paste flowchart (graph TD / graph LR) or mindmap markdown to generate roadmap nodes."
      icon={<Workflow className="h-4 w-4" />}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex items-center gap-4 border-0 p-0">
            <legend className="sr-only">Import mode</legend>
            <label className="t-micro inline-flex cursor-pointer items-center gap-1.5" style={{ color: 'var(--theme-text-muted)' }}>
              <input
                type="radio"
                name="importMode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
                className="accent-[var(--theme-primary)]"
              />
              Append to current roadmap
            </label>
            <label className="t-micro inline-flex cursor-pointer items-center gap-1.5" style={{ color: 'var(--theme-text-muted)' }}>
              <input
                type="radio"
                name="importMode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className="accent-[var(--theme-primary)]"
              />
              Replace all existing nodes
            </label>
          </fieldset>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-quiet">
              Cancel
            </button>
            <button type="button" onClick={handleImport} className="btn btn-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Parse &amp; import nodes
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            Presets
          </span>
          <button type="button" onClick={() => setCode(SAMPLE_FLOWCHART)} className="btn btn-quiet btn-sm">
            <ChartColumn className="h-3.5 w-3.5" aria-hidden="true" />
            Flowchart TD
          </button>
          <button type="button" onClick={() => setCode(SAMPLE_MINDMAP)} className="btn btn-quiet btn-sm">
            <Brain className="h-3.5 w-3.5" aria-hidden="true" />
            Mindmap tree
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mermaid-source" className="t-label" style={{ color: 'var(--theme-text-faint)' }}>
            Mermaid source
          </label>
          <textarea
            id="mermaid-source"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={11}
            spellCheck={false}
            className="field font-mono text-xs"
            style={{ lineHeight: 1.6 }}
            placeholder={'graph TD\n  A --> B'}
            aria-describedby="mermaid-hint"
            aria-invalid={!!error}
          />
          <p id="mermaid-hint" className="t-micro" style={{ color: 'var(--theme-text-faint)' }}>
            Supports <code className="font-mono">graph TD</code>, <code className="font-mono">graph LR</code> and{' '}
            <code className="font-mono">mindmap</code> syntax.
          </p>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-xl px-3 py-2.5"
            style={{
              backgroundColor: 'var(--theme-danger-soft)',
              color: 'var(--theme-danger)',
              border: '1px solid color-mix(in oklab, var(--theme-danger) 35%, transparent)',
            }}
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="t-small">{error}</span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
