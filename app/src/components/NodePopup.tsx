import { BookOpen, Check, SkipForward, FileText, ExternalLink, X, Cloud } from 'lucide-react';
import type { NodeStatus, ProgressMap, RMNode } from '../lib/types';

interface Props {
  node: RMNode;
  x: number;
  y: number;
  progress: ProgressMap;
  onSetStatus: (status: NodeStatus | null) => void;
  onOpenResources: () => void;
  onOpenNotes?: () => void;
  onClose: () => void;
  /** Optional secondary action, e.g. jump to the node in the roadmap view. */
  onOpenInRoadmap?: () => void;
  /** Other roadmaps where this topic is already done (covered display). */
  coveredBy?: { slug: string; title: string }[];
}

/** Floating popup after clicking a node — official-style actions. */
export default function NodePopup({
  node,
  x,
  y,
  progress,
  onSetStatus,
  onOpenResources,
  onOpenNotes,
  onClose,
  onOpenInRoadmap,
  coveredBy,
}: Props) {
  const status = progress[node.id];

  const btn =
    'px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95';

  const isNearTop = y < 130;
  const clampedX = Math.max(160, Math.min(window.innerWidth - 160, x));
  const transform = isNearTop ? 'translate(-50%, 25%)' : 'translate(-50%, -120%)';

  return (
    <div
      className="fixed z-50 rounded-2xl shadow-2xl border p-2 flex items-center gap-1.5 flex-wrap max-w-[95vw] animate-in fade-in"
      style={{ left: clampedX, top: y, transform, backgroundColor: 'var(--theme-surface)', borderColor: 'var(--theme-border)' }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Options for ${node.data?.label || node.id}`}
    >
      {status === 'covered' && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 rounded-lg text-xs max-w-sm" style={{ backgroundColor: 'var(--theme-primary-soft)', borderColor: 'var(--theme-primary)', color: 'var(--theme-done)' }}>
          <Cloud className="w-4 h-4 shrink-0 text-done" />
          <span>
            Done in{' '}
            {(coveredBy || []).length > 0 ? (
              (coveredBy || []).map((r, i) => (
                <span key={r.slug}>
                  {i > 0 && ', '}
                  <b>{r.title}</b>
                </span>
              ))
            ) : (
              <b>another roadmap</b>
            )}
            . Mark it here only if you want to track it separately.
          </span>
        </div>
      )}
      <button
        className={btn}
        style={{
          color: status === 'learning' ? 'var(--theme-primary-ink)' : 'var(--theme-text)',
          backgroundColor: status === 'learning' ? 'var(--theme-learning)' : 'var(--theme-surface)',
          borderColor: status === 'learning' ? 'var(--theme-learning)' : 'var(--theme-border-strong)',
        }}
        onClick={() => onSetStatus(status === 'learning' ? null : 'learning')}
        title="Mark as learning"
      >
        <BookOpen className="w-3.5 h-3.5 shrink-0" />
        <span>Learning</span>
      </button>
      <button
        className={btn}
        style={{
          color: status === 'done' ? 'var(--theme-primary-ink)' : 'var(--theme-text)',
          backgroundColor: status === 'done' ? 'var(--theme-primary)' : 'var(--theme-surface)',
          borderColor: status === 'done' ? 'var(--theme-primary)' : 'var(--theme-border-strong)',
        }}
        onClick={() => onSetStatus(status === 'done' ? null : 'done')}
        title="Mark as done"
      >
        <Check className="w-3.5 h-3.5 shrink-0" />
        <span>Done</span>
      </button>
      <button
        className={btn}
        style={{
          color: status === 'skipped' ? 'var(--theme-primary-ink)' : 'var(--theme-text)',
          backgroundColor: status === 'skipped' ? 'var(--theme-skipped)' : 'var(--theme-surface)',
          borderColor: status === 'skipped' ? 'var(--theme-skipped)' : 'var(--theme-border-strong)',
        }}
        onClick={() => onSetStatus(status === 'skipped' ? null : 'skipped')}
        title="Skip this node"
      >
        <SkipForward className="w-3.5 h-3.5 shrink-0" />
        <span>Skip</span>
      </button>
      <span className="w-px h-6 mx-0.5" style={{ backgroundColor: 'var(--theme-border)' }} />
      <button
        className={btn}
        style={{
          color: 'var(--theme-text)',
          backgroundColor: 'var(--theme-surface)',
          borderColor: 'var(--theme-border-strong)',
        }}
        onClick={onOpenResources}
        title="Open resources"
      >
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        <span>Resources</span>
      </button>
      {onOpenNotes && (
        <button
          className={btn}
          style={{
            color: 'var(--theme-text)',
            backgroundColor: 'var(--theme-surface)',
            borderColor: 'var(--theme-border-strong)',
          }}
          onClick={onOpenNotes}
          title="Open notes"
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>Notes</span>
        </button>
      )}
      {onOpenInRoadmap && (
        <button
          className={btn}
          style={{
            color: 'var(--theme-text)',
            backgroundColor: 'var(--theme-surface)',
            borderColor: 'var(--theme-border-strong)',
          }}
          onClick={onOpenInRoadmap}
          title="Open this topic in the full roadmap"
        >
          <span>Open in roadmap</span>
        </button>
      )}
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[var(--theme-hover-bg)] active:scale-95"
        style={{ color: 'var(--theme-text-muted)' }}
        onClick={onClose}
        title="Close"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
      <span className="sr-only">{node.id}</span>
    </div>
  );
}
