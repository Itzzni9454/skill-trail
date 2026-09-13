import { useMemo, useRef, useState } from 'react';
import type { LegendItem, ProgressMap, RMNode, Roadmap } from '../lib/types';
import {
  EDGE_COLOR,
  ellipsize,
  ensureNodeSized,
  firstLineCenterY,
  isInteractiveType,
  measureText,
  nodeHref,
  nodeSize,
  renderEdge,
  renderNodeGeometry,
  resolveNodeUrl,
  wrapLinesMeasured,
  zIndexOf,
} from '../lib/renderer';
import { STATUS_OUTLINE } from '../lib/cross';

const FAMILY = "balsamiq, 'Balsamiq Sans', sans-serif";

interface Props {
  roadmap: Roadmap;
  progress: ProgressMap;
  onNodeClick?: (node: RMNode, e: React.MouseEvent) => void;
  onChecklistToggle?: (itemId: string) => void;
  /** Editor mode: nodes draggable. */
  editable?: boolean;
  onNodesChange?: (nodes: RMNode[]) => void;
  selectedNodeId?: string | null;
  /** Dim everything that's not on your learning path (done/learning + next step). */
  highlightPath?: boolean;
}

/** Compute the official viewBox = tight bounding box of all nodes. */
export function viewBoxOf(roadmap: Roadmap): string {
  if (!roadmap.nodes.length) return '0 0 100 100';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const raw of roadmap.nodes) {
    const n = ensureNodeSized(raw);
    const { w, h } = nodeSize(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  // Official renderer frames the roadmap with uniform padding (expanded to 36px to prevent clipping).
  const pad = 36;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
}

/**
 * Legend tick rendered at a node border, official-style (probe4/probe5 against
 * the live site): r=9.5 circle with a white check path. The circle sits half
 * inside the node border on each axis:
 *   cx: left => x + 1.5, right => x + w - 3.5, center-ish => x + w/2 - 0.75
 *   cy: top => y + 8.5, bottom => y + h - 9.5, center => y + h/2
 * (probed right-center: cy = rect.y + h/2, cx = rect.x + rect.w - 3.5)
 * NOTE: data positions are "<horizontal>-<vertical>" (left-center, right-center,
 * top-right…), so the FIRST token is the horizontal side.
 */
function LegendTick({ item, node }: { item: LegendItem; node: RMNode }) {
  const { w, h } = nodeSize(node);
  const pos = item.position || 'right-center';
  const [horiz, vert] = pos.split('-');
  const absCx =
    node.position.x +
    (horiz === 'left' ? 1.5 : horiz === 'right' ? w - 3.5 : w / 2 - 0.75);
  const absCy =
    node.position.y +
    (vert === 'top' ? 8.5 : vert === 'bottom' ? h - 9.5 : h / 2);
  return (
    <g pointerEvents="none">
      <circle cx={absCx} cy={absCy} r={9.5} fill={item.color} />
      <path
        d={`M${absCx - 4} ${absCy}L${absCx - 1.5} ${absCy + 3}L${absCx + 3.5} ${absCy - 3}`}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Check-circle icon at an absolute position, official look. */
function CheckCircle({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={9.5} fill={color} />
      <path
        d={`M${cx - 4} ${cy}L${cx - 1.5} ${cy + 3}L${cx + 3.5} ${cy - 3}`}
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/**
 * Legend box, official geometry (probed from the live site):
 * - rect inset by half stroke, rx 5
 * - legend: no title, first item center 28.5 below node top, pitch 32
 * - linksgroup: title at 29, first item at 67.5, pitch 30 (items never overlap
 *   the title row)
 * - icons at x+35.5 (legend) / x+32.5 (links), labels at x+53 (legend) /
 *   x+50 (links), each +2.5 baseline shift
 *
 * Link items render as real SVG anchors with an invisible full-row hit rect,
 * so clicks land even on the whitespace between glyphs.
 */
function GroupBox({
  x,
  y,
  w,
  h,
  title,
  items,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional header line (linksgroup only). */
  title?: string;
  items: { label: string; url?: string; color?: string }[];
}) {
  const sw = 2.7;
  const hasTitle = !!title;
  const iconDx = hasTitle ? 32.5 : 35.5;
  const textDx = hasTitle ? 50 : 53;
  const firstDy = hasTitle ? 67.5 : 28.5;
  const rowDy = hasTitle ? 30 : 32;
  const labelMax = Math.max(30, w - textDx - 14);
  return (
    <g>
      <rect
        x={x + sw / 2}
        y={y + sw / 2}
        width={w - sw}
        height={h - sw}
        rx={5}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={sw}
        // don't swallow clicks meant for the legend/link items inside the box
        pointerEvents={hasTitle ? 'stroke' : 'none'}
      />
      {hasTitle && (
        <text
          x={x + 24}
          y={y + 29 + 2.5}
          fontSize={16}
          fill="#000000"
          dominantBaseline="middle"
          style={{ fontFamily: FAMILY, pointerEvents: 'none', userSelect: 'none' }}
        >
          {ellipsize(title, Math.max(30, w - 24 - 12), 16)}
        </text>
      )}
      {items.map((it, i) => {
        const cy = y + firstDy + i * rowDy;
        const inner = (
          <>
            <CheckCircle cx={x + iconDx} cy={cy} color={it.color || '#6b7280'} />
            <text
              x={x + textDx}
              y={cy + 2.5}
              fontSize={16}
              fill="#000000"
              dominantBaseline="middle"
              style={{ fontFamily: FAMILY, pointerEvents: 'none', userSelect: 'none' }}
            >
              {ellipsize(it.label, labelMax, 16)}
            </text>
          </>
        );
        const hit = (
          <rect
            x={x + 18}
            y={cy - 15}
            width={Math.max(60, w - 28)}
            height={30}
            fill="transparent"
          />
        );
        const resolved = it.url ? resolveNodeUrl(it.url) : null;
        if (resolved) {
          return (
            <a
              key={i}
              href={resolved.href}
              target={resolved.external ? '_blank' : undefined}
              rel={resolved.external ? 'noreferrer noopener' : undefined}
              style={{ cursor: 'pointer' }}
            >
              {hit}
              {inner}
            </a>
          );
        }
        return <g key={i}>{hit}{inner}</g>;
      })}
    </g>
  );
}

function ChecklistGroup({
  node,
  w,
  h,
  progress,
  interactive,
  onItemToggle,
  onNodeClick,
}: {
  node: RMNode;
  w: number;
  h: number;
  progress: ProgressMap;
  interactive?: boolean;
  onItemToggle?: (itemId: string) => void;
  onNodeClick?: (node: RMNode, e: React.MouseEvent) => void;
}) {
  const sw = 2.7;
  const items = node.data?.checklists || [];
  const title = (node.data?.label || '').trim();
  const hasTitle = !!title;
  const itemN = items.length;

  const topPad = hasTitle ? 48 : 14;
  const availH = h - topPad - 12;
  const pitch = itemN > 1 ? Math.min(36, Math.max(28, availH / (itemN - 1))) : 32;
  const firstDy = hasTitle ? 52 : (h - (itemN - 1) * pitch) / 2;

  return (
    <g data-node-id={node.id} data-type="checklist">
      {/* Outer Card */}
      <rect
        x={node.position.x + sw / 2}
        y={node.position.y + sw / 2}
        width={w - sw}
        height={h - sw}
        rx={5}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={sw}
      />
      {hasTitle && (
        <>
          <text
            x={node.position.x + 18}
            y={node.position.y + 26}
            fontSize={16}
            fontWeight={700}
            fill="#000000"
            dominantBaseline="middle"
            style={{ fontFamily: FAMILY, pointerEvents: 'none', userSelect: 'none' }}
          >
            {ellipsize(title, Math.max(30, w - 36), 16)}
          </text>
          <line
            x1={node.position.x + 8}
            y1={node.position.y + 40}
            x2={node.position.x + w - 8}
            y2={node.position.y + 40}
            stroke="#e2e8f0"
            strokeWidth={1.5}
          />
        </>
      )}
      {items.map((it, i) => {
        const cy = node.position.y + firstDy + i * pitch;
        const isDone = progress[it.id] === 'done' || progress[`${node.id}__${it.id}`] === 'done';
        const boxX = node.position.x + 16;
        const boxY = cy - 8.5;
        const textX = node.position.x + 42;
        const maxTextW = Math.max(30, w - 52);

        return (
          <g
            key={it.id || i}
            onClick={(e) => {
              if (interactive) {
                e.stopPropagation();
                if (onItemToggle) {
                  onItemToggle(it.id || `${node.id}__${i}`);
                } else if (onNodeClick) {
                  onNodeClick(node, e);
                }
              }
            }}
            style={{ cursor: interactive ? 'pointer' : 'default' }}
          >
            {/* Hit area */}
            <rect
              x={node.position.x + 4}
              y={cy - pitch / 2 + 1}
              width={w - 8}
              height={pitch - 2}
              fill="transparent"
            />
            {/* Checkbox */}
            <rect
              x={boxX}
              y={boxY}
              width={17}
              height={17}
              rx={3.5}
              fill={isDone ? 'var(--theme-done, #10b981)' : '#ffffff'}
              stroke={isDone ? 'var(--theme-done, #10b981)' : '#000000'}
              strokeWidth={1.8}
            />
            {isDone && (
              <path
                d={`M${boxX + 3.5} ${boxY + 8.5} L${boxX + 7} ${boxY + 12} L${boxX + 13.5} ${boxY + 4.5}`}
                fill="none"
                stroke="#ffffff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <text
              x={textX}
              y={cy + 0.5}
              fontSize={14}
              fill={isDone ? 'var(--theme-text-muted, #64748b)' : '#000000'}
              textDecoration={isDone ? 'line-through' : 'none'}
              dominantBaseline="middle"
              textAnchor="start"
              style={{ fontFamily: FAMILY, pointerEvents: 'none', userSelect: 'none' }}
            >
              {ellipsize(it.label, maxTextW, 14)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function TodoNode({
  node,
  w,
  h,
  progress,
  interactive,
  onToggle,
}: {
  node: RMNode;
  w: number;
  h: number;
  progress: ProgressMap;
  interactive?: boolean;
  onToggle?: (node: RMNode, e: React.MouseEvent) => void;
}) {
  const sw = 2.7;
  const isDone = progress[node.id] === 'done';
  const label = (node.data?.label || '').trim();
  const boxX = node.position.x + 14;
  const boxY = node.position.y + h / 2 - 8.5;
  const textX = node.position.x + 40;
  const maxTextW = Math.max(30, w - 50);

  return (
    <g
      data-node-id={node.id}
      data-type="todo"
      onClick={(e) => interactive && onToggle?.(node, e)}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
    >
      <rect
        x={node.position.x + sw / 2}
        y={node.position.y + sw / 2}
        width={w - sw}
        height={h - sw}
        rx={5}
        fill={isDone ? 'var(--theme-done-soft, #d1fae5)' : '#ffffff'}
        stroke={isDone ? 'var(--theme-done, #10b981)' : '#000000'}
        strokeWidth={sw}
      />
      {/* Checkbox */}
      <rect
        x={boxX}
        y={boxY}
        width={17}
        height={17}
        rx={3.5}
        fill={isDone ? 'var(--theme-done, #10b981)' : '#ffffff'}
        stroke={isDone ? 'var(--theme-done, #10b981)' : '#000000'}
        strokeWidth={1.8}
      />
      {isDone && (
        <path
          d={`M${boxX + 3.5} ${boxY + 8.5} L${boxX + 7} ${boxY + 12} L${boxX + 13.5} ${boxY + 4.5}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <text
        x={textX}
        y={node.position.y + h / 2 + 0.5}
        fontSize={node.data?.style?.fontSize || 14.5}
        fontWeight={isDone ? 600 : undefined}
        fill={isDone ? 'var(--theme-done, #047857)' : '#000000'}
        textDecoration={isDone ? 'line-through' : 'none'}
        dominantBaseline="middle"
        textAnchor="start"
        style={{ fontFamily: FAMILY, pointerEvents: 'none', userSelect: 'none' }}
      >
        {ellipsize(label, maxTextW, node.data?.style?.fontSize || 14.5)}
      </text>
    </g>
  );
}

export default function RoadmapSVG({
  roadmap,
  progress,
  onNodeClick,
  onChecklistToggle,
  editable = false,
  onNodesChange,
  selectedNodeId,
  highlightPath = false,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // All nodes sized up-front: geometry, viewBox and edges all see complete boxes.
  const sizedNodes = useMemo(() => roadmap.nodes.map(ensureNodeSized), [roadmap]);
  const sizedById = useMemo(() => new Map(sizedNodes.map((n) => [n.id, n])), [sizedNodes]);

  /** Nodes on the current path: marked done/learning, plus their direct next steps. */
  const pathSet = useMemo(() => {
    if (!highlightPath) return null;
    const active = new Set<string>();
    for (const [id, st] of Object.entries(progress)) {
      if (st === 'done' || st === 'learning') active.add(id);
    }
    // next-step: targets of edges coming out of active nodes (that aren't active yet)
    for (const e of roadmap.edges) {
      if (active.has(e.source) && !active.has(e.target)) {
        const t = sizedById.get(e.target);
        if (t && isInteractiveType(t)) active.add(e.target);
      }
    }
    // entry nodes (no incoming edges) stay visible so a fresh roadmap isn't fully dimmed
    const hasIncoming = new Set(roadmap.edges.map((e) => e.target));
    for (const n of sizedNodes) {
      if (isInteractiveType(n) && !hasIncoming.has(n.id)) active.add(n.id);
    }
    return active;
  }, [highlightPath, progress, roadmap, sizedById, sizedNodes]);

  function startDrag(node: RMNode, e: React.MouseEvent) {
    if (!editable || !onNodesChange) return;
    // Map client px -> SVG user units using current viewBox scale
    const vb = (svgRef.current?.getAttribute('viewBox') || '0 0 1 1').split(/[\s,]+/).map(Number);
    const rect = svgRef.current?.getBoundingClientRect();
    const scale = rect && vb[2] ? vb[2] / rect.width : 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const px = node.position.x;
    const py = node.position.y;
    const id = node.id;

    function move(ev: MouseEvent) {
      const nx = px + (ev.clientX - startX) * scale;
      const ny = py + (ev.clientY - startY) * scale;
      onNodesChange!(sizedNodes.map((n) => (n.id === id ? { ...n, position: { x: nx, y: ny } } : n)));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.stopPropagation();
    e.preventDefault();
  }

  function renderNode(node: RMNode) {
    const status = progress[node.id];
    const { w, h } = nodeSize(node);
    const interactive = isInteractiveType(node);
    const dimmed = pathSet ? !pathSet.has(node.id) : false;
    const nodeOpacity = dimmed ? (status === 'skipped' ? 0.12 : 0.18) : status === 'skipped' ? 0.45 : 1;

    if (node.type === 'vertical' || node.type === 'horizontal') {
      const sw = node.data?.style?.strokeWidth ?? 3.5;
      const stroke = node.data?.style?.stroke || EDGE_COLOR;
      const dash = node.data?.style?.strokeDasharray;
      const dashAttr = dash && dash !== '0' ? dash : undefined;
      const common = { stroke, strokeWidth: sw, strokeDasharray: dashAttr, strokeLinecap: 'round' as const };
      return (
        <g key={node.id} opacity={0.95}>
          {node.type === 'vertical' ? (
            <line x1={node.position.x + w / 2} y1={node.position.y} x2={node.position.x + w / 2} y2={node.position.y + h} {...common} />
          ) : (
            <line x1={node.position.x} y1={node.position.y + h / 2} x2={node.position.x + w} y2={node.position.y + h / 2} {...common} />
          )}
        </g>
      );
    }

    if (node.type === 'legend') {
      const items = (node.data?.legends || []).map((l) => ({ label: l.label, color: l.color }));
      return (
        <g key={node.id} data-node-id={node.id} data-type="legend">
          <GroupBox x={node.position.x} y={node.position.y} w={w} h={h} items={items} />
        </g>
      );
    }

    if (node.type === 'linksgroup') {
      const items = (node.data?.links || []).map((l) => ({ label: l.label, url: l.url }));
      return (
        <g key={node.id} data-node-id={node.id} data-type="linksgroup">
          <GroupBox
            x={node.position.x}
            y={node.position.y}
            w={w}
            h={h}
            title={node.data?.label || undefined}
            items={items}
          />
        </g>
      );
    }

    if (node.type === 'checklist') {
      return (
        <ChecklistGroup
          key={node.id}
          node={node}
          w={w}
          h={h}
          progress={progress}
          interactive={interactive}
          onItemToggle={onChecklistToggle}
          onNodeClick={onNodeClick}
        />
      );
    }

    if (node.type === 'todo') {
      return (
        <TodoNode
          key={node.id}
          node={node}
          w={w}
          h={h}
          progress={progress}
          interactive={interactive}
          onToggle={(n, e) => {
            if (onChecklistToggle) {
              onChecklistToggle(n.id);
            } else if (onNodeClick) {
              onNodeClick(n, e);
            }
          }}
        />
      );
    }

    const g = renderNodeGeometry(node);
    const label = (node.data?.label || '').trim();
    const isLabelOnly = node.type === 'label';
    const isPara = node.type === 'paragraph';
    const textAlign = node.data?.style?.textAlign;
    const isCentered = textAlign === 'center';
    const isParaRight = isPara && textAlign === 'right';
    const isParaMiddle = isPara && textAlign === 'center';
    const padVal = typeof node.data?.style?.padding === 'number' ? node.data.style.padding : undefined;
    const paraPadX = padVal !== undefined ? padVal : 18;
    const paraPadY = padVal !== undefined ? padVal : 18;
    const isCenteredPara = isPara && node.data?.style?.justifyContent === 'center';

    const wrapPadX = isPara ? (padVal !== undefined ? padVal * 2 : 36) : 12;

    // Official renderer lines determination:
    // - Labels: non-rectangular, single-line (unless explicit \n), never word-wrap
    // - Titles: single-line, ellipsize if needed
    // - Paragraphs: wrap at (w - wrapPadX)
    // - Topics/Subtopics: keep single-line; wrap as last resort if exceeding box width
    const lines = !label
      ? []
      : isLabelOnly
        ? (label.includes('\n') ? label.split('\n') : [label])
        : node.type === 'title'
          ? [label]
          : isPara
            ? wrapLinesMeasured(label, Math.max(10, w - wrapPadX), g.fontSize)
            : measureText(label, g.fontSize) <= w - 12
              ? [label]
              : wrapLinesMeasured(label, Math.max(10, w - 12), g.fontSize);
    const lineH = g.fontSize * 1.5;

    // Y positioning:
    // - Labels: rendered with dominantBaseline="auto" at y + 25 (matches official roadmap.sh)
    // - Paragraphs: top-aligned at y + paraPadY + lineH/2 unless explicitly justifyContent: 'center'
    // - Topics/Subtopics: centered vertically via firstLineCenterY
    const firstY = isLabelOnly
      ? node.position.y + 25
      : isPara
        ? (isCenteredPara
            ? node.position.y + firstLineCenterY(lines.length, h, g.fontSize)
            : node.position.y + paraPadY + (g.fontSize * 1.5) / 2)
        : node.position.y + firstLineCenterY(lines.length, h, g.fontSize) + 2.15;

    // X positioning & text-anchor:
    // Properly respects textAlign ('right', 'center', 'left') and node-specific padding
    const anchorX = isPara
      ? isParaMiddle
        ? node.position.x + w / 2
        : isParaRight
          ? node.position.x + w - paraPadX
          : node.position.x + paraPadX
      : isLabelOnly
        ? isCentered
          ? node.position.x + w / 2
          : textAlign === 'right'
            ? node.position.x + w - 10
            : node.position.x + 10
        : node.position.x + w / 2;

    const anchorAlign: 'start' | 'middle' | 'end' = isPara
      ? isParaMiddle
        ? 'middle'
        : isParaRight
          ? 'end'
          : 'start'
      : isLabelOnly
        ? isCentered
          ? 'middle'
          : textAlign === 'right'
            ? 'end'
            : 'start'
        : 'middle';

    // Titles never wrap; truncate with an ellipsis if they can't fit.
    // Non-paragraph nodes: if the box's official width can't fit a wrapped line
    // (font metric drift), ellipsize that line so it never clips the border.
    const displayLines =
      node.type === 'title'
        ? [ellipsize(label, w - 10, g.fontSize)]
        : isLabelOnly || isPara || !label
          ? lines
          : lines.map((ln) =>
              measureText(ln, g.fontSize) > w - 12 ? ellipsize(ln, w - 12, g.fontSize) : ln,
            );

    /**
     * Status indicator: a full colored outline over the node border (see
     * STATUS_OUTLINE in lib/cross) plus a "covered" pill when the topic is
     * done in another roadmap. The outline replaces the old corner dot as the
     * primary signal and stays visible at any zoom level.
     */
    const outline = status ? STATUS_OUTLINE[status as keyof typeof STATUS_OUTLINE] : undefined;
    const rawHref = nodeHref(node);
    const link = rawHref ? resolveNodeUrl(rawHref) : null;
    const href = editable || !link ? undefined : link.href;
    const clickable = !!(interactive && onNodeClick) || !!href;

    const isTransparentBg = g.fill === 'transparent' || !g.fill;
    const defaultTextColor =
      isTransparentBg && (g.textColor === '#000000' || g.textColor === '#000' || !g.textColor)
        ? 'var(--theme-text)'
        : g.textColor;
    const resolvedSectionStroke =
      node.type === 'section' && (g.stroke === '#000000' || g.stroke === '#000')
        ? 'var(--theme-border-strong)'
        : g.stroke;

    // Status overrides: full cell fill, stroke, text and indicators
    let resolvedFill = g.fill;
    let resolvedStroke = resolvedSectionStroke;
    let resolvedStrokeWidth = g.strokeWidth;
    let resolvedStrokeDash: string | undefined = outline?.dash;
    let resolvedTextColor = defaultTextColor;
    let resolvedFontWeight: string | number | undefined = undefined;

    if (status === 'done') {
      resolvedFill = 'var(--theme-done, #10b981)';
      resolvedStroke = 'var(--theme-done, #059669)';
      resolvedStrokeWidth = Math.max(g.strokeWidth, 2.5);
      resolvedStrokeDash = undefined;
      resolvedTextColor = 'var(--theme-primary-ink, #ffffff)';
      resolvedFontWeight = 600;
    } else if (status === 'learning') {
      resolvedFill = 'var(--theme-learning, #3b82f6)';
      resolvedStroke = 'var(--theme-learning, #2563eb)';
      resolvedStrokeWidth = Math.max(g.strokeWidth, 2.5);
      resolvedStrokeDash = '7 4';
      resolvedTextColor = 'var(--theme-primary-ink, #ffffff)';
      resolvedFontWeight = 600;
    } else if (status === 'skipped') {
      resolvedFill = 'var(--theme-surface-2, #e5e7eb)';
      resolvedStroke = 'var(--theme-skipped, #9ca3af)';
      resolvedStrokeWidth = Math.max(g.strokeWidth, 1.8);
      resolvedStrokeDash = '4 4';
      resolvedTextColor = 'var(--theme-text-muted, #6b7280)';
    } else if (status === 'covered') {
      resolvedFill = 'var(--theme-accent-soft, #e0f2fe)';
      resolvedStroke = 'var(--theme-accent, #0ea5e9)';
      resolvedStrokeWidth = Math.max(g.strokeWidth, 2);
      resolvedStrokeDash = '3 3';
    }

    const textEl = displayLines.length === 0 ? null : (
      <text
        x={anchorX}
        y={firstY}
        textAnchor={anchorAlign}
        dominantBaseline="middle"
        fontSize={g.fontSize}
        fontWeight={resolvedFontWeight}
        fill={resolvedTextColor}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {displayLines.map((ln, i) => (
          <tspan key={i} x={anchorX} dy={i === 0 ? 0 : lineH}>
            {ln}
          </tspan>
        ))}
      </text>
    );

    if (isLabelOnly) {
      // Official renderer draws labels as text only (no rect) — positioned at x+10, y+25,
      // dominantBaseline="auto", text-anchor="start" (unless textAlign: center).
      const labelX = anchorX;
      const labelAnchor = anchorAlign;
      const labelTextColor =
        status === 'done'
          ? 'var(--theme-done, #10b981)'
          : status === 'learning'
            ? 'var(--theme-learning, #3b82f6)'
            : status === 'skipped'
              ? 'var(--theme-text-muted, #6b7280)'
              : resolvedTextColor;
      return (
        <g
          key={node.id}
          data-node-id={node.id}
          data-type={node.type}
          opacity={nodeOpacity}
          onMouseDown={(e) => startDrag(node, e)}
          onClick={(e) => interactive && onNodeClick?.(node, e)}
          style={{ cursor: interactive ? 'pointer' : 'default' }}
        >
          {status === 'done' && (
            <g pointerEvents="none">
              <circle cx={labelX - 9} cy={firstY - 6} r={6} fill="var(--theme-done, #10b981)" />
              <text
                x={labelX - 9}
                y={firstY - 5.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8.5}
                fontWeight={700}
                fill="#fff"
                style={{ fontFamily: FAMILY }}
              >
                ✓
              </text>
            </g>
          )}
          {status === 'learning' && (
            <g pointerEvents="none">
              <circle cx={labelX - 9} cy={firstY - 6} r={6} fill="var(--theme-learning, #3b82f6)" />
              <text
                x={labelX - 9}
                y={firstY - 5.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8.5}
                fontWeight={700}
                fill="#fff"
                style={{ fontFamily: FAMILY }}
              >
                ●
              </text>
            </g>
          )}
          {status === 'covered' && (
            <g pointerEvents="none">
              <circle cx={labelX - 9} cy={firstY - 6} r={6} fill="#0ea5e9" />
              <text
                x={labelX - 9}
                y={firstY - 5.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8.5}
                fontWeight={700}
                fill="#fff"
                style={{ fontFamily: FAMILY }}
              >
                ✓
              </text>
            </g>
          )}
          {node.data?.legend && <LegendTick item={node.data.legend} node={node} />}
          {selectedNodeId === node.id && (
            <rect
              x={node.position.x - 4}
              y={node.position.y - 4}
              width={w + 8}
              height={h + 8}
              rx={8}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
          <text
            x={labelX}
            y={firstY}
            textAnchor={labelAnchor}
            dominantBaseline="auto"
            fontSize={g.fontSize}
            fontWeight={status === 'done' || status === 'learning' ? 700 : undefined}
            fill={labelTextColor}
            textDecoration={status === 'skipped' ? 'line-through' : 'none'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {displayLines.map((ln, i) => (
              <tspan key={i} x={labelX} dy={i === 0 ? 0 : lineH}>
                {ln}
              </tspan>
            ))}
          </text>
        </g>
      );
    }

    const body = (
      <>
        <rect
          x={g.rect.x}
          y={g.rect.y}
          width={g.rect.w}
          height={g.rect.h}
          rx={g.rx}
          fill={resolvedFill}
          stroke={resolvedStroke}
          strokeWidth={resolvedStrokeWidth}
          strokeDasharray={resolvedStrokeDash}
        />
        {status === 'done' && (
          <g pointerEvents="none">
            <circle
              cx={g.rect.x + g.rect.w - 10}
              cy={g.rect.y + 10}
              r={7.5}
              fill="rgba(0, 0, 0, 0.22)"
            />
            <text
              x={g.rect.x + g.rect.w - 10}
              y={g.rect.y + 10.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9.5}
              fontWeight={800}
              fill="#ffffff"
              style={{ fontFamily: FAMILY }}
            >
              ✓
            </text>
          </g>
        )}
        {status === 'learning' && (
          <g pointerEvents="none">
            <circle
              cx={g.rect.x + g.rect.w - 10}
              cy={g.rect.y + 10}
              r={7.5}
              fill="rgba(0, 0, 0, 0.22)"
            />
            <text
              x={g.rect.x + g.rect.w - 10}
              y={g.rect.y + 10.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={800}
              fill="#ffffff"
              style={{ fontFamily: FAMILY }}
            >
              ●
            </text>
          </g>
        )}
        {status === 'skipped' && (
          <line
            x1={node.position.x + 8}
            y1={node.position.y + h - 8}
            x2={node.position.x + w - 8}
            y2={node.position.y + 8}
            stroke="var(--theme-skipped, #6b7280)"
            strokeWidth={2.5}
            opacity={0.8}
          />
        )}
        {status === 'covered' && (
          <g pointerEvents="none">
            <rect
              x={g.rect.x + g.rect.w - 20}
              y={g.rect.y + g.rect.h - 12}
              width={17}
              height={12}
              rx={6}
              fill="#0ea5e9"
            />
            <text
              x={g.rect.x + g.rect.w - 11.5}
              y={g.rect.y + g.rect.h - 5.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={700}
              fill="#fff"
              style={{ fontFamily: FAMILY }}
            >
              ✓
            </text>
          </g>
        )}
        {node.data?.legend && <LegendTick item={node.data.legend} node={node} />}
        {hoverId === node.id && (
          <rect
            x={g.rect.x}
            y={g.rect.y}
            width={g.rect.w}
            height={g.rect.h}
            rx={g.rx}
            fill={status ? 'rgba(255, 255, 255, 0.14)' : 'none'}
            stroke={status ? 'rgba(255, 255, 255, 0.45)' : '#111111'}
            strokeWidth={g.strokeWidth}
            pointerEvents="none"
          />
        )}
        {textEl}
        {selectedNodeId === node.id && (
          <rect
            x={node.position.x - 4}
            y={node.position.y - 4}
            width={w + 8}
            height={h + 8}
            rx={8}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
      </>
    );

    return (
      <g
        key={node.id}
        data-node-id={node.id}
        data-type={node.type}
        opacity={nodeOpacity}
        onMouseDown={(e) => startDrag(node, e)}
        onClick={(e) => {
          if (!interactive || !onNodeClick) return;
          onNodeClick(node, e);
        }}
        onMouseEnter={() => setHoverId(node.id)}
        onMouseLeave={() => setHoverId((cur) => (cur === node.id ? null : cur))}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
      >
        {href ? <a href={href}>{body}</a> : body}
      </g>
    );
  }

  // Official z-order: section boxes (-999) render behind everything else.
  const orderedNodes = useMemo(
    () => [...sizedNodes].sort((a, b) => zIndexOf(a) - zIndexOf(b)),
    [sizedNodes],
  );

  return (
    <svg ref={svgRef} width="100%" height="100%" viewBox={viewBoxOf(roadmap)} style={{ fontFamily: FAMILY }}>
      {roadmap.edges.map((edge) => {
        const e = renderEdge(edge, sizedById);
        if (!e) return null;
        const onPath = !pathSet || (pathSet.has(edge.source) && pathSet.has(edge.target));
        return (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={highlightPath && onPath ? 'var(--theme-note, #7c3aed)' : e.stroke}
            strokeWidth={highlightPath && onPath ? e.strokeWidth + 1.2 : e.strokeWidth}
            strokeDasharray={e.dasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={onPath ? 1 : 0.1}
          />
        );
      })}
      {orderedNodes.map(renderNode)}
    </svg>
  );
}
