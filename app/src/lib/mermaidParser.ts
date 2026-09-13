import type { RMEdge, RMNode } from './types';

function uid(): string {
  return 'm_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(4);
}

/**
 * 100% Offline pure JS parser for Mermaid diagrams:
 * - Flowcharts / Graphs: `graph TD`, `graph LR`, `flowchart TD`, `flowchart LR`
 * - Mindmaps: `mindmap` indentation trees
 */
export function parseMermaidToRoadmap(code: string): { nodes: RMNode[]; edges: RMEdge[] } {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (lines.length === 0) {
    return { nodes: [], edges: [] };
  }

  const firstLine = lines[0].toLowerCase();

  if (firstLine.startsWith('mindmap')) {
    return parseMindmap(code);
  } else {
    return parseFlowchart(lines);
  }
}

/**
 * Parse Mermaid Mindmap syntax:
 * mindmap
 *   root((Root Name))
 *     Topic 1
 *       Subtopic 1.1
 *     Topic 2
 */
function parseMindmap(rawCode: string): { nodes: RMNode[]; edges: RMEdge[] } {
  const rawLines = rawCode.split('\n');
  interface StackItem {
    id: string;
    depth: number;
    label: string;
  }

  const stack: StackItem[] = [];
  const nodes: RMNode[] = [];
  const edges: RMEdge[] = [];

  const colSpacing = 280;
  const rowSpacing = 90;
  let currentRow = 0;

  for (const rawLine of rawLines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('%%') || rawLine.trim().toLowerCase() === 'mindmap') {
      continue;
    }

    const indent = rawLine.search(/\S/);
    const text = rawLine.trim();

    // Extract clean label
    let cleanLabel = text
      .replace(/^root\(\((.*?)\)\)/, '$1')
      .replace(/^\(\((.*?)\)\)/, '$1')
      .replace(/^\[(.*?)\]/, '$1')
      .replace(/^[a-zA-Z0-9_]+\s*\(\((.*?)\)\)/, '$1')
      .replace(/^[a-zA-Z0-9_]+\s*\[(.*?)\]/, '$1')
      .trim();

    if (!cleanLabel) cleanLabel = text;

    const nodeId = uid();

    // Pop items from stack with greater or equal indent
    while (stack.length > 0 && stack[stack.length - 1].depth >= indent) {
      stack.pop();
    }

    const depthLevel = stack.length;
    const parent = stack.length > 0 ? stack[stack.length - 1] : null;

    const x = depthLevel * colSpacing + 100;
    const y = currentRow * rowSpacing + 100;
    currentRow++;

    nodes.push({
      id: nodeId,
      type: depthLevel <= 1 ? 'topic' : 'subtopic',
      position: { x, y },
      width: 220,
      height: 48,
      data: {
        label: cleanLabel,
        style: { fontSize: depthLevel === 0 ? 18 : 15 },
      },
    });

    if (parent) {
      edges.push({
        id: uid(),
        source: parent.id,
        target: nodeId,
        sourceHandle: 'z2',
        targetHandle: 'w2',
      });
    }

    stack.push({ id: nodeId, depth: indent, label: cleanLabel });
  }

  return { nodes, edges };
}

/**
 * Parse Mermaid Flowchart syntax:
 * graph TD
 *   A[Frontend Basics] --> B[HTML & CSS]
 *   B --> C[JavaScript]
 */
function parseFlowchart(lines: string[]): { nodes: RMNode[]; edges: RMEdge[] } {
  const nodeMap = new Map<string, { id: string; label: string }>();
  const rawEdges: { sourceRaw: string; targetRaw: string; label?: string }[] = [];

  const isLR = lines[0].toLowerCase().includes('lr');

  // Regex to match: ID[Label] or ID(Label) or just ID
  const extractNode = (token: string): { rawId: string; label: string } => {
    const match = token.match(/^([a-zA-Z0-9_-]+)(?:\[(.*?)\]|\((.*?)\)|\(\((.*?)\)\))?$/);
    if (match) {
      const rawId = match[1];
      const label = match[2] || match[3] || match[4] || rawId;
      return { rawId, label };
    }
    return { rawId: token, label: token };
  };

  // Connection pattern: A --> B, A --- B, A ==> B, with optional |label|
  const edgeRegex = /^(.+?)\s*(?:-->|---|==>)(?:\|(.*?)\|)?\s*(.+)$/;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(edgeRegex);

    if (match) {
      const left = extractNode(match[1].trim());
      const edgeLabel = match[2]?.trim();
      const right = extractNode(match[3].trim());

      if (!nodeMap.has(left.rawId)) {
        nodeMap.set(left.rawId, { id: uid(), label: left.label });
      } else if (left.label !== left.rawId) {
        nodeMap.get(left.rawId)!.label = left.label;
      }

      if (!nodeMap.has(right.rawId)) {
        nodeMap.set(right.rawId, { id: uid(), label: right.label });
      } else if (right.label !== right.rawId) {
        nodeMap.get(right.rawId)!.label = right.label;
      }

      rawEdges.push({
        sourceRaw: left.rawId,
        targetRaw: right.rawId,
        label: edgeLabel,
      });
    } else {
      // Single standalone node declaration like `A[Node Label]`
      const node = extractNode(line);
      if (node.rawId && !nodeMap.has(node.rawId)) {
        nodeMap.set(node.rawId, { id: uid(), label: node.label });
      }
    }
  }

  // Compute topological depths using BFS from root nodes
  const incomingCount = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  for (const rawId of nodeMap.keys()) {
    incomingCount.set(rawId, 0);
    childrenMap.set(rawId, []);
  }

  for (const e of rawEdges) {
    incomingCount.set(e.targetRaw, (incomingCount.get(e.targetRaw) || 0) + 1);
    childrenMap.get(e.sourceRaw)?.push(e.targetRaw);
  }

  const roots = Array.from(nodeMap.keys()).filter((id) => (incomingCount.get(id) || 0) === 0);
  if (roots.length === 0 && nodeMap.size > 0) {
    roots.push(Array.from(nodeMap.keys())[0]);
  }

  const depthMap = new Map<string, number>();
  const queue = [...roots];
  for (const r of roots) depthMap.set(r, 0);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const d = depthMap.get(curr) || 0;
    for (const child of childrenMap.get(curr) || []) {
      if (!depthMap.has(child)) {
        depthMap.set(child, d + 1);
        queue.push(child);
      }
    }
  }

  // Group nodes by depth for grid layout
  const byDepth = new Map<number, string[]>();
  for (const rawId of nodeMap.keys()) {
    const d = depthMap.get(rawId) || 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(rawId);
  }

  const nodes: RMNode[] = [];
  const colGap = isLR ? 280 : 260;
  const rowGap = isLR ? 100 : 120;

  for (const [d, rawIds] of byDepth.entries()) {
    rawIds.forEach((rawId, idx) => {
      const item = nodeMap.get(rawId)!;
      const x = isLR ? d * colGap + 80 : idx * colGap + 80;
      const y = isLR ? idx * rowGap + 80 : d * rowGap + 80;

      nodes.push({
        id: item.id,
        type: d === 0 ? 'topic' : 'subtopic',
        position: { x, y },
        width: 220,
        height: 48,
        data: {
          label: item.label,
          style: { fontSize: d === 0 ? 17 : 15 },
        },
      });
    });
  }

  const edges: RMEdge[] = rawEdges.map((re) => ({
    id: uid(),
    source: nodeMap.get(re.sourceRaw)!.id,
    target: nodeMap.get(re.targetRaw)!.id,
    sourceHandle: 'z2',
    targetHandle: 'w2',
  }));

  return { nodes, edges };
}
