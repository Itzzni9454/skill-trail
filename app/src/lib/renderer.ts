/**
 * Core rendering model — replicates the official roadmap.sh SVG renderer,
 * derived attribute-by-attribute from the live site (see scripts/extract_official_svg.py).
 */
import type { RMEdge, RMNode } from './types';

export const DEFAULT_STROKE = '#000000';
export const EDGE_COLOR = '#2b78e4';

/** Per-type rectangle fill (colorType 'c' nodes render like subtopics). */
export function nodeFill(node: RMNode): string {
  const t = node.type;
  if (t === 'topic') return node.data?.style?.colorType === 'c' ? '#ffe599' : '#fdff00';
  if (t === 'subtopic') return '#ffe599';
  if (t === 'button' || t === 'resourceButton')
    return node.data?.backgroundColor || node.data?.style?.backgroundColor || '#dedede';
  if (t === 'legend' || t === 'linksgroup') return '#ffffff';
  return node.data?.style?.backgroundColor || 'transparent';
}

export function nodeSize(node: RMNode): { w: number; h: number } {
  const w = node.width ?? node.measured?.width ?? node.style?.width ?? node.data?.style?.width ?? 240;
  const h = node.height ?? node.measured?.height ?? node.style?.height ?? node.data?.style?.height ?? 49;
  return { w, h };
}

/**
 * Exact advance widths of the official Balsamiq Sans font, in 1/100 em units,
 * measured per character from the live roadmap.sh renderer
 * (scripts/probe_official_legend2.py). Unknown glyphs fall back to 50.
 */
const BALSAMIQ_ADVANCES: Record<string, number> = {
  ' ': 26.99,
  '0': 58.81, '1': 38.71, '2': 59, '3': 61.5, '4': 61, '5': 57.3, '6': 61.11, '7': 49.1, '8': 58.31, '9': 57.8,
  a: 56.61, b: 56.31, c: 53.21, d: 57.3, e: 59.3, f: 30.9, g: 57.71, h: 55.3, i: 23.41, j: 27.2,
  k: 49.86, l: 22.31, m: 82.69, n: 56.4, o: 56.81, p: 58.01, q: 58.4, r: 38.53, s: 49.51, t: 30.7,
  u: 55.71, v: 49.86, w: 68.23, x: 46.8, y: 46.46, z: 49.86,
  A: 61.2, B: 68.51, C: 71.1, D: 72.9, E: 65.91, F: 60.06, G: 75.01, H: 73.1, I: 31.01, J: 54.4,
  K: 65.73, L: 57.8, M: 86.31, N: 75.2, O: 76.2, P: 62.9, Q: 78.2, R: 71.1, S: 60.51, T: 60.1,
  U: 73.2, V: 61.8, W: 91.11, X: 57.8, Y: 60.06, Z: 63.46,
  '.': 19.51, ',': 18.2, '!': 20.91, '?': 50.7, "'": 22.4, '"': 37.31, '-': 36.6, '&': 66.3,
  '/': 45.21, '(': 36, ')': 37.1, ':': 20.2, ';': 20.61, '+': 66.9, '#': 64.3, '%': 94.4,
  '*': 46.71, '@': 92.2, _: 68, $: 71.1, '=': 71.5, '[': 37.5, ']': 34.21, '<': 69.7, '>': 76.11,
  '~': 70.41, '`': 21.53, '^': 52.7, '|': 20.51, '{': 42.6, '}': 42.8, '\\': 42.41,
  '…': 58,
};

/**
 * Rendered width of a label in px using the official Balsamiq advances —
 * validated against the live site to within ~0.5% (calibration string probed
 * at 647.78px; this table yields the same within rounding).
 */
export function measureText(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += BALSAMIQ_ADVANCES[ch] ?? 50;
  return (units * fontSize) / 100;
}

/**
 * Vertical center (SVG y for dominantBaseline=middle) of the FIRST line of a
 * wrapped block inside a box of height h, so the whole block is visually
 * centered: block occupies lineCount * (fontSize*1.5) around this point.
 * Single source of truth shared by ensureNodeSized() and the SVG component —
 * that's what keeps wrapped text from clipping the box.
 */
export function firstLineCenterY(lineCount: number, h: number, fontSize: number): number {
  const lineH = fontSize * 1.5;
  return h / 2 - ((lineCount - 1) * lineH) / 2;
}

/** Truncate a label with an ellipsis so it fits maxWidth, measured. */
export function ellipsize(label: string, maxWidth: number, fontSize: number): string {
  if (measureText(label, fontSize) <= maxWidth) return label;
  let out = label;
  while (out.length > 1 && measureText(out + '…', fontSize) > maxWidth) out = out.slice(0, -1);
  return out + '…';
}

/**
 * Fill in missing node dimensions so text never overflows its box.
 * Sizing matches the official renderer closely:
 *   w = textWidth + 2*24.6 (side padding), h = 46.3 + stroke (single line)
 * Paragraphs wrap at (w - 24)px and grow vertically, boxes centered on x.
 */
export function ensureNodeSized(node: RMNode): RMNode {
  if (node.type === 'legend' || node.type === 'linksgroup') {
    const itemN = node.type === 'legend'
      ? (node.data?.legends?.length ?? 0)
      : (node.data?.links?.length ?? 0);
    const w = node.width ?? node.measured?.width ?? 373;
    // official: legend rows pitch 32 from first center 28.5 (+29 pad bottom);
    // linksgroup: title at 29, first item 67.5, pitch 30, 38.5 bottom margin
    const h = node.height ?? node.measured?.height ?? (node.type === 'legend' ? 29 + itemN * 32 : 76 + itemN * 30);
    return { ...node, width: w, height: h };
  }
  if (node.type === 'checklist') {
    const items = node.data?.checklists || [];
    const itemN = items.length;
    const hasTitle = !!node.data?.label?.trim();
    const topPad = hasTitle ? 48 : 20;
    const calcH = topPad + itemN * 34 + 14;
    let maxW = hasTitle ? measureText(node.data!.label!, 16) + 36 : 120;
    for (const it of items) {
      const lw = measureText(it.label || '', 14);
      if (lw > maxW) maxW = lw;
    }
    const calcW = Math.ceil(maxW + 56);
    const w = Math.max(node.width ?? node.measured?.width ?? 260, calcW);
    const h = Math.max(node.height ?? node.measured?.height ?? calcH, calcH);
    return { ...node, width: w, height: h };
  }
  if (node.type === 'todo') {
    const label = (node.data?.label || '').trim();
    const fontSize = node.data?.style?.fontSize || 15;
    const calcW = Math.ceil(measureText(label, fontSize) + 56);
    const w = Math.max(node.width ?? node.measured?.width ?? 220, calcW);
    const h = Math.max(node.height ?? node.measured?.height ?? 44, 44);
    return { ...node, width: w, height: h };
  }
  const isTextual = ['topic', 'subtopic', 'button', 'resourceButton', 'label', 'paragraph', 'title', 'todo', 'checklist'].includes(node.type);
  if (!isTextual) return node;

  const label = (node.data?.label || '').trim();
  const fontSize = node.data?.style?.fontSize || (node.type === 'title' ? 28 : 17);
  let { w, h } = nodeSize(node);
  let pos = node.position;

  if (!node.width && !node.measured?.width) {
    if (node.type === 'paragraph') {
      // official wraps paragraph text with ~12px side padding; wrap width from
      // data.style.width when present, else a sane 380px column
      const target = Math.min(430, Math.max(120, node.data?.style?.width || 380));
      const first = wrapLinesMeasured(label, target - 24, fontSize);
      const widest = Math.max(...first.map((l) => measureText(l, fontSize)), 0);
      w = widest + 24;
      // re-wrap at the final inner width so the stored height matches rendering
      const lines = wrapLinesMeasured(label, w - 24, fontSize);
      h = lines.length * fontSize * 1.5 + 30;
      // official keeps box center-x fixed when auto-sizing
      const cx = node.position.x + (node.data?.style?.width || 0) / 2;
      pos = { x: cx - w / 2, y: node.position.y };
    } else if (node.type === 'label') {
      w = Math.ceil(measureText(label, fontSize)) + 20;
      h = 38;
    } else {
      w = measureText(label, fontSize) + 2 * 24.6;
      h = node.type === 'title' ? 68 : 49;
    }
  }

  // Always ensure height is sufficient for the wrapped text to prevent
  // clipping. First-line center (firstLineCenterY) puts the whole wrapped
  // block inside [top + 2.15, bottom - 2.15]; reqH derives from that, so a
  // box grown here and the rendered lines always agree.
  // Labels are non-rectangular category headers and do not expand vertically.
  if (node.type === 'paragraph') {
    const pad = typeof node.data?.style?.padding === 'number' ? node.data.style.padding * 2 : 24;
    const reqH = wrapLinesMeasured(label, Math.max(10, w - pad), fontSize).length * fontSize * 1.5 + (pad > 0 ? 30 : 0);
    if (h < reqH) h = reqH;
  } else if (node.type !== 'title' && node.type !== 'label') {
    const lines = wrapLinesMeasured(label, Math.max(10, w - 14), fontSize);
    const reqH = Math.max(49, lines.length * fontSize * 1.5 + 16);
    if (h < reqH) h = reqH;
  }

  return { ...node, position: pos, width: w, height: h };
}

/**
 * Handle id -> side. Official behavior: every numbered handle attaches at the
 * *midpoint* of its side (verified against all 138 edge endpoints of /frontend).
 */
export function handleSide(handle?: string): 'w' | 'x' | 'y' | 'z' {
  const c = (handle || '').charAt(0);
  if (c === 'w') return 'w';
  if (c === 'x') return 'x';
  if (c === 'y') return 'y';
  return 'z';
}

/** Attachment point of a handle on a node (absolute SVG coordinates). */
export function handlePoint(node: RMNode, handle?: string): { x: number; y: number } {
  const { w, h } = nodeSize(node);
  const { x, y } = node.position;
  const side = handleSide(handle);
  if (side === 'w') return { x: x + w / 2, y }; // top
  if (side === 'x') return { x: x + w / 2, y: y + h }; // bottom
  if (side === 'y') return { x, y: y + h / 2 }; // left
  return { x: x + w, y: y + h / 2 }; // right (z)
}

/** Bezier path between two points, official-style: control points at axis midpoints. */
export function edgePath(
  from: { x: number; y: number; side: string },
  to: { x: number; y: number; side: string },
): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const c1 =
    from.side === 'w' || from.side === 'x'
      ? { x: from.x, y: my }
      : { x: mx, y: from.y };
  const c2 =
    to.side === 'w' || to.side === 'x'
      ? { x: to.x, y: my }
      : { x: mx, y: to.y };
  return `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
}

export interface RenderedEdge {
  id: string;
  d: string;
  stroke: string;
  strokeWidth: number;
  dasharray?: string;
}

export function renderEdge(edge: RMEdge, nodeById: Map<string, RMNode>): RenderedEdge | null {
  const a = nodeById.get(edge.source);
  const b = nodeById.get(edge.target);
  if (!a || !b) return null;
  const p1 = handlePoint(a, edge.sourceHandle);
  const p2 = handlePoint(b, edge.targetHandle);
  const s1 = handleSide(edge.sourceHandle);
  const s2 = handleSide(edge.targetHandle);
  const stroke = edge.style?.stroke && edge.style.stroke.toLowerCase() !== '#000'
    ? edge.style.stroke
    : EDGE_COLOR;
  const strokeWidth = edge.style?.strokeWidth || 3.5;
  const dash = edge.style?.strokeDasharray;
  return {
    id: edge.id,
    d: edgePath(
      { ...p1, side: s1 },
      { ...p2, side: s2 },
    ),
    stroke,
    strokeWidth,
    dasharray: dash && dash !== '0' ? dash : undefined,
  };
}

/**
 * Greedy word wrap. `maxChars` is advisory — a line never exceeds it unless a
 * single word is longer, and we never emit trailing empty lines.
 */
export function wrapLines(label: string, maxChars: number): string[] {
  const text = (label || '').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = word;
    } else {
      cur = (cur + ' ' + word).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

/**
 * Greedy word wrap driven by *measured* text width (Balsamiq advances), so the
 * same call in sizing and rendering always produces identical lines.
 */
export function wrapLinesMeasured(label: string, maxWidth: number, fontSize: number): string[] {
  const text = (label || '').trim();
  if (!text) return [];
  if (measureText(text, fontSize) <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const cand = cur ? `${cur} ${word}` : word;
    if (measureText(cand, fontSize) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Rect/text geometry for a node, mirroring the official output exactly. */
export function renderNodeGeometry(node: RMNode): {
  rect: { x: number; y: number; w: number; h: number };
  fill: string;
  stroke: string;
  strokeWidth: number;
  rx: number;
  textColor: string;
  fontSize: number;
} {
  const { w, h } = nodeSize(node);
  const isShape = node.type === 'vertical' || node.type === 'horizontal';
  const strokeWidth = isShape
    ? (node.data?.style?.strokeWidth ?? 3.5)
    : node.type === 'paragraph'
      ? 2.5
      : 2.7;
  const fill = nodeFill(node);
  const btnFill =
    node.type === 'button' || node.type === 'resourceButton'
      ? node.data?.borderColor || node.data?.backgroundColor || fill
      : null;
  const stroke =
    btnFill
      ? btnFill
      : node.type === 'topic' || node.type === 'subtopic'
        ? '#000000'
        : (node.data?.style?.borderColor || '#000000');
  return {
    rect: {
      x: node.position.x + strokeWidth / 2,
      y: node.position.y + strokeWidth / 2,
      // Official renderer quirk: paragraphs inset height but not width.
      w: node.type === 'paragraph' ? w : w - strokeWidth,
      h: h - strokeWidth,
    },
    fill,
    stroke,
    strokeWidth,
    rx: 5,
    textColor: node.data?.color || node.data?.style?.color || '#000000',
    fontSize: node.data?.style?.fontSize || (node.type === 'title' ? 28 : 17),
  };
}

/** Interactive node types eligible for progress tracking. */
export function isInteractiveType(node: RMNode): boolean {
  return ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(node.type);
}

/** External link target of a node, if any (buttons etc.). */
export function nodeHref(node: RMNode): string | undefined {
  const href = node.data?.href;
  return href && href.trim() ? href : undefined;
}

/**
 * Resolve a node/link URL for offline navigation:
 * - relative in-site links ("/backend", "/backend?r=x") -> in-app hash route
 * - absolute roadmap.sh/<slug> links -> in-app hash route
 * - everything else (deep links, PDFs, external sites) -> open in a new tab
 */
export function resolveNodeUrl(url: string): { href: string; external: boolean } | null {
  const u = (url || '').trim();
  if (!u) return null;
  if (u.startsWith('/')) {
    const slug = u.slice(1).split(/[?#]/)[0];
    return slug ? { href: `#/roadmap/${slug}`, external: false } : { href: '#/', external: false };
  }
  const m = u.match(/^https?:\/\/(?:www\.)?roadmap\.sh(\/.*)?$/i);
  if (m) {
    const rest = m[1] || '/';
    const sm = rest.match(/^\/([a-z0-9-]+)\/?$/i);
    if (sm) return { href: `#/roadmap/${sm[1]}`, external: false };
    return { href: u, external: true }; // deep links (projects, videos, guides…)
  }
  return { href: u, external: true };
}

/** Sort key replicating official z-order: sections (-999) < shapes/others (999). */
export function zIndexOf(node: RMNode): number {
  if (typeof node.zIndex === 'number') return node.zIndex;
  if (node.type === 'section') return -999;
  return 999;
}
