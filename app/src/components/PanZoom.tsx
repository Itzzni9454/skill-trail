import { useRef, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Initial zoom multiplier. */
  initialZoom?: number;
  onBackgroundClick?: () => void;
  zoom?: number;
  setZoom?: (z: number | ((prev: number) => number)) => void;
  pan?: { x: number; y: number };
  setPan?: (p: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  onPanZoomChange?: (zoom: number, pan: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
}

/** Pan (drag) + zoom (wheel) wrapper supporting controlled & uncontrolled states. */
export default function PanZoom({
  children,
  initialZoom = 1,
  onBackgroundClick,
  zoom: controlledZoom,
  setZoom: controlledSetZoom,
  pan: controlledPan,
  setPan: controlledSetPan,
  onPanZoomChange,
  containerRef: externalContainerRef,
}: Props) {
  const [internalZoom, setInternalZoom] = useState(initialZoom);
  const [internalPan, setInternalPan] = useState({ x: 0, y: 0 });

  const isControlledZoom = controlledZoom !== undefined;
  const isControlledPan = controlledPan !== undefined;

  const currentZoom = isControlledZoom ? controlledZoom : internalZoom;
  const currentPan = isControlledPan ? controlledPan : internalPan;

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const rootRef = externalContainerRef || internalContainerRef;

  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const hasMoved = useRef(false);

  const updateZoom = (nextZoomOrFn: number | ((z: number) => number)) => {
    const nextVal = typeof nextZoomOrFn === 'function' ? nextZoomOrFn(currentZoom) : nextZoomOrFn;
    const clamped = Math.min(6, Math.max(0.08, nextVal));
    if (controlledSetZoom) controlledSetZoom(clamped);
    else setInternalZoom(clamped);
    onPanZoomChange?.(clamped, currentPan);
  };

  const updatePan = (nextPanOrFn: { x: number; y: number } | ((p: { x: number; y: number }) => { x: number; y: number })) => {
    const nextVal = typeof nextPanOrFn === 'function' ? nextPanOrFn(currentPan) : nextPanOrFn;
    if (controlledSetPan) controlledSetPan(nextVal);
    else setInternalPan(nextVal);
    onPanZoomChange?.(currentZoom, nextVal);
  };

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    updateZoom((z) => z * factor);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    hasMoved.current = false;
    drag.current = { sx: e.clientX, sy: e.clientY, px: currentPan.x, py: currentPan.y };

    function move(ev: MouseEvent) {
      if (!drag.current) return;
      if (Math.hypot(ev.clientX - drag.current.sx, ev.clientY - drag.current.sy) > 4) {
        hasMoved.current = true;
      }
      updatePan({
        x: drag.current.px + (ev.clientX - drag.current.sx),
        y: drag.current.py + (ev.clientY - drag.current.sy),
      });
    }

    function up(ev: MouseEvent) {
      drag.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);

      if (!hasMoved.current) {
        const target = ev.target as HTMLElement | SVGElement | null;
        const isInteractive = target?.closest?.('button, a, input, [role="button"], g[cursor="pointer"], .interactive-node');
        if (!isInteractive) {
          onBackgroundClick?.();
        }
      }
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div
      ref={rootRef}
      className="w-full h-full overflow-hidden relative select-none"
      onWheel={onWheel}
      onMouseDown={handleMouseDown}
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
    >
      <div
        style={{
          transform: `translate(${currentPan.x}px, ${currentPan.y}px) scale(${currentZoom})`,
          transformOrigin: 'center center',
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </div>

      {/* Zoom controls — icons rather than "+"/"-" glyphs, which render at
          inconsistent weight across platforms. The percentage doubles as the
          reset control, which is where people reach for it anyway. */}
      <div
        className="absolute bottom-4 left-4 z-20 flex items-center overflow-hidden rounded-lg"
        style={{
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          boxShadow: 'var(--theme-shadow)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        role="group"
        aria-label="Canvas zoom"
      >
        <button
          type="button"
          className="grid h-8 w-8 place-items-center transition-colors hover:bg-[var(--theme-hover-bg)]"
          style={{ color: 'var(--theme-text-muted)' }}
          onClick={() => updateZoom((z) => Math.max(0.08, z / 1.25))}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="tnum h-8 border-x px-2 font-mono text-[11px] transition-colors hover:bg-[var(--theme-hover-bg)]"
          style={{ color: 'var(--theme-text)', borderColor: 'var(--theme-border)' }}
          onClick={() => {
            updateZoom(initialZoom);
            updatePan({ x: 0, y: 0 });
          }}
          title="Reset view"
        >
          {Math.round(currentZoom * 100)}%
        </button>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center transition-colors hover:bg-[var(--theme-hover-bg)]"
          style={{ color: 'var(--theme-text-muted)' }}
          onClick={() => updateZoom((z) => Math.min(6, z * 1.25))}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
