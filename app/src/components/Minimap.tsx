import React, { useRef, useState } from 'react';
import { Compass, ChevronDown, ChevronUp } from 'lucide-react';

export interface MinimapNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isTopic?: boolean;
  status?: string;
}

interface Props {
  nodes: MinimapNode[];
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
  containerWidth: number;
  containerHeight: number;
  className?: string;
}

export default function Minimap({
  nodes,
  canvasWidth,
  canvasHeight,
  zoom,
  pan,
  onPanChange,
  containerWidth,
  containerHeight,
  className = '',
}: Props) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const minimapRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const MAP_W = 180;
  const MAP_H = 120;

  // Viewport calculation
  // In canvas SVG coords: center is (0,0), viewBox is (-canvasWidth/2, -canvasHeight/2, canvasWidth, canvasHeight)
  const minCanvasX = -canvasWidth / 2;
  const minCanvasY = -canvasHeight / 2;

  // Visible canvas range:
  // viewportLeft in canvas units:
  const visibleWidthCanvas = containerWidth / zoom;
  const visibleHeightCanvas = containerHeight / zoom;
  const visibleCenterX = -pan.x / zoom;
  const visibleCenterY = -pan.y / zoom;

  const viewX1 = visibleCenterX - visibleWidthCanvas / 2;
  const viewY1 = visibleCenterY - visibleHeightCanvas / 2;

  // Scale canvas to minimap coords
  const scaleX = MAP_W / canvasWidth;
  const scaleY = MAP_H / canvasHeight;

  const toMapX = (cx: number) => (cx - minCanvasX) * scaleX;
  const toMapY = (cy: number) => (cy - minCanvasY) * scaleY;
  const fromMapX = (mx: number) => mx / scaleX + minCanvasX;
  const fromMapY = (my: number) => my / scaleY + minCanvasY;

  // Viewport rect on minimap
  const rectMapX = Math.max(0, Math.min(MAP_W, toMapX(viewX1)));
  const rectMapY = Math.max(0, Math.min(MAP_H, toMapY(viewY1)));
  const rectMapW = Math.max(12, Math.min(MAP_W - rectMapX, visibleWidthCanvas * scaleX));
  const rectMapH = Math.max(12, Math.min(MAP_H - rectMapY, visibleHeightCanvas * scaleY));

  function handleMinimapClick(e: React.MouseEvent<SVGSVGElement>) {
    e.stopPropagation();
    if (!minimapRef.current) return;
    const bbox = minimapRef.current.getBoundingClientRect();
    const mx = e.clientX - bbox.left;
    const my = e.clientY - bbox.top;

    const targetCanvasX = fromMapX(mx);
    const targetCanvasY = fromMapY(my);

    onPanChange({
      x: -targetCanvasX * zoom,
      y: -targetCanvasY * zoom,
    });
  }

  function startDrag(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = true;

    function move(ev: MouseEvent) {
      if (!draggingRef.current || !minimapRef.current) return;
      const bbox = minimapRef.current.getBoundingClientRect();
      const mx = Math.max(0, Math.min(MAP_W, ev.clientX - bbox.left));
      const my = Math.max(0, Math.min(MAP_H, ev.clientY - bbox.top));

      const targetCanvasX = fromMapX(mx);
      const targetCanvasY = fromMapY(my);

      onPanChange({
        x: -targetCanvasX * zoom,
        y: -targetCanvasY * zoom,
      });
    }

    function up() {
      draggingRef.current = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div
      className={`absolute bottom-4 right-4 z-20 flex flex-col items-end pointer-events-auto ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 mb-1 backdrop-blur px-3 py-1.5 rounded-t-xl border border-b-0 text-xs font-semibold shadow-xs cursor-pointer select-none active:scale-95"
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderColor: 'var(--theme-border)',
          color: 'var(--theme-text)',
        }}
        title={collapsed ? 'Expand radar navigator' : 'Minimize radar navigator'}
        aria-label="Toggle radar navigator"
      >
        <Compass className="w-3.5 h-3.5 text-learning shrink-0" />
        <span>Radar</span>
        {collapsed ? <ChevronUp className="w-3.5 h-3.5 opacity-70 shrink-0 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0 ml-0.5" />}
      </button>

      {!collapsed && (
        <div
          className="relative rounded-lg shadow-lg border backdrop-blur overflow-hidden select-none"
          style={{
            backgroundColor: 'var(--theme-surface)',
            borderColor: 'var(--theme-border)',
          }}
        >
          <svg
            ref={minimapRef}
            width={MAP_W}
            height={MAP_H}
            onClick={handleMinimapClick}
            className="cursor-crosshair"
            style={{ backgroundColor: 'var(--theme-bg)' }}
          >
            {/* Grid texture */}
            <defs>
              <pattern id="minimap-grid" width="15" height="15" patternUnits="userSpaceOnUse">
                <path d="M 15 0 L 0 0 0 15" fill="none" stroke="var(--theme-border)" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width={MAP_W} height={MAP_H} fill="url(#minimap-grid)" />

            {/* Nodes */}
            {nodes.map((n) => {
              const nx = toMapX(n.x);
              const ny = toMapY(n.y);
              const nw = Math.max(3, n.w * scaleX);
              const nh = Math.max(2, n.h * scaleY);
              const color =
                n.status === 'done'
                  ? 'var(--theme-done)'
                  : n.status === 'learning'
                  ? 'var(--theme-learning)'
                  : n.status === 'skipped'
                  ? 'var(--theme-skipped)'
                  : n.isTopic
                  ? 'var(--theme-due)'
                  : 'var(--theme-border-strong)';

              return (
                <rect
                  key={n.id}
                  x={nx - nw / 2}
                  y={ny - nh / 2}
                  width={nw}
                  height={nh}
                  rx={1}
                  fill={color}
                  opacity={0.85}
                />
              );
            })}

            {/* Viewport rectangle */}
            <rect
              x={rectMapX}
              y={rectMapY}
              width={rectMapW}
              height={rectMapH}
              fill="var(--theme-primary)"
              fillOpacity={0.15}
              stroke="var(--theme-primary)"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              className="cursor-move"
              onMouseDown={startDrag}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
