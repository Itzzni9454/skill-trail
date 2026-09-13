/**
 * Rich Mindmap & Roadmap Export Suite
 *
 * Provides standard interoperability exports:
 * 1. OPML 2.0 (MindNode, OmniOutliner, Workflowy)
 * 2. FreeMind / Freeplane (.mm XML)
 * 3. Standalone Portable HTML Bundle (Self-contained, 100% offline viewer)
 */
import type { ProgressMap, Roadmap } from './types';

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate OPML 2.0 XML string from a roadmap hierarchy.
 */
export function generateOPML(roadmap: Roadmap, progress: ProgressMap = {}, notes: Record<string, string> = {}): string {
  const title = escapeXml(roadmap.title?.page || roadmap.title?.card || roadmap.slug || 'Roadmap');
  const now = new Date().toUTCString();

  const nodeById = new Map(roadmap.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const e of roadmap.edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
    hasIncoming.add(e.target);
  }

  let roots = roadmap.nodes.filter((n) => !hasIncoming.has(n.id) && ['topic', 'subtopic', 'todo', 'checklist'].includes(n.type)).map((n) => n.id);
  if (!roots.length && roadmap.nodes.length) roots = [roadmap.nodes[0].id];

  function dumpOutline(nodeId: string): string {
    const n = nodeById.get(nodeId);
    if (!n) return '';
    const label = escapeXml(n.data?.label || (n.type === 'checklist' ? 'Checklist' : nodeId));
    const status = progress[nodeId] || 'unstarted';
    const note = notes[nodeId] ? ` _note="${escapeXml(notes[nodeId])}"` : '';
    const kids = (childrenMap.get(nodeId) || []).filter((id) => nodeById.has(id));

    const checklistOutlines = (n.type === 'checklist' && Array.isArray(n.data?.checklists))
      ? n.data.checklists.map((it) => {
          const itemStatus = progress[it.id] || 'unstarted';
          return `<outline text="${escapeXml(it.label)}" _status="${itemStatus}"/>`;
        })
      : [];

    if (!kids.length && !checklistOutlines.length) {
      return `<outline text="${label}" _status="${status}"${note}/>`;
    }
    const inner = [...checklistOutlines, ...kids.map((cid) => dumpOutline(cid))].join('\n');
    return `<outline text="${label}" _status="${status}"${note}>\n${inner}\n</outline>`;
  }

  const outlines = roots.map(dumpOutline).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${title}</title>
    <dateCreated>${now}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;
}

/**
 * Generate FreeMind / Freeplane (.mm) XML from a roadmap hierarchy.
 */
export function generateFreeMind(roadmap: Roadmap, progress: ProgressMap = {}, notes: Record<string, string> = {}): string {
  const title = escapeXml(roadmap.title?.page || roadmap.title?.card || roadmap.slug || 'Roadmap');
  const nodeById = new Map(roadmap.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const e of roadmap.edges) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
    childrenMap.get(e.source)!.push(e.target);
    hasIncoming.add(e.target);
  }

  let roots = roadmap.nodes.filter((n) => !hasIncoming.has(n.id) && ['topic', 'subtopic', 'todo', 'checklist'].includes(n.type)).map((n) => n.id);
  if (!roots.length && roadmap.nodes.length) roots = [roadmap.nodes[0].id];

  function dumpFreeMindNode(nodeId: string): string {
    const n = nodeById.get(nodeId);
    if (!n) return '';
    const label = escapeXml(n.data?.label || (n.type === 'checklist' ? 'Checklist' : nodeId));
    const status = progress[nodeId];
    const color = status === 'done' ? '#10b981' : status === 'learning' ? '#0284c7' : '#0f172a';
    const noteText = notes[nodeId];

    let hookXml = '';
    if (noteText) {
      hookXml = `<hook NAME="accessories/plugins/NodeNote.properties"><text>${escapeXml(noteText)}</text></hook>`;
    }

    const iconXml = status === 'done' ? '<icon BUILTIN="button_ok"/>' : status === 'learning' ? '<icon BUILTIN="idea"/>' : '';
    const kids = (childrenMap.get(nodeId) || []).filter((id) => nodeById.has(id));

    const checklistXml = (n.type === 'checklist' && Array.isArray(n.data?.checklists))
      ? n.data.checklists.map((it) => {
          const itemStatus = progress[it.id];
          const itemColor = itemStatus === 'done' ? '#10b981' : '#0f172a';
          const itemIcon = itemStatus === 'done' ? '<icon BUILTIN="button_ok"/>' : '';
          return `<node ID="${escapeXml(it.id)}" TEXT="${escapeXml(it.label)}" COLOR="${itemColor}">${itemIcon}</node>`;
        })
      : [];

    if (!kids.length && !checklistXml.length) {
      return `<node ID="${nodeId}" TEXT="${label}" COLOR="${color}">${iconXml}${hookXml}</node>`;
    }
    const inner = [...checklistXml, ...kids.map((cid) => dumpFreeMindNode(cid))].join('\n');
    return `<node ID="${nodeId}" TEXT="${label}" COLOR="${color}">\n${iconXml}${hookXml}\n${inner}\n</node>`;
  }

  const rootNodesXml = roots.map((r) => dumpFreeMindNode(r)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
  <!-- ${title} -->
${rootNodesXml}
</map>`;
}

/**
 * Generate a 100% standalone, self-contained single HTML bundle with SVG,
 * topic search, status indicators, and embedded notes that works anywhere offline.
 */
export function generateStandaloneHTML(
  roadmap: Roadmap,
  progress: ProgressMap = {},
  notes: Record<string, string> = {},
  svgString = '',
): string {
  const title = escapeXml(roadmap.title?.page || roadmap.title?.card || roadmap.slug || 'Roadmap');
  const interactive: { id: string; label: string; type: string; status: string | null; note: string | null }[] = [];
  for (const n of (roadmap.nodes || [])) {
    if (['topic', 'subtopic', 'todo'].includes(n.type)) {
      interactive.push({
        id: n.id,
        label: n.data?.label || n.id,
        type: n.type,
        status: progress[n.id] || null,
        note: notes[n.id] || null,
      });
    } else if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
      for (const it of n.data.checklists) {
        interactive.push({
          id: it.id,
          label: it.label || it.id,
          type: 'checklist-item',
          status: progress[it.id] || null,
          note: notes[it.id] || null,
        });
      }
    }
  }
  const doneCount = interactive.filter((n) => n.status === 'done').length;
  const pct = interactive.length ? Math.round((doneCount / interactive.length) * 100) : 0;

  const topicsData = JSON.stringify(interactive);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Offline Portable Roadmap</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      height: 56px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 16px;
      z-index: 10;
    }
    header h1 { font-size: 16px; font-weight: 700; }
    .badge {
      font-size: 12px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 600;
    }
    .container {
      display: flex;
      flex: 1;
      height: calc(100vh - 56px);
      overflow: hidden;
    }
    .canvas-pane {
      flex: 1;
      overflow: auto;
      background: #f7f4ed;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .canvas-pane svg {
      max-width: 96%;
      max-height: 96%;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.08));
    }
    .sidebar {
      width: 340px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .search-box {
      padding: 14px;
      border-bottom: 1px solid var(--border);
    }
    .search-box input {
      width: 100%;
      padding: 8px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    .topic-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 0;
    }
    .topic-item {
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 13px;
    }
    .topic-item:hover { background: rgba(255,255,255,0.03); }
    .status-tag {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .status-done { background: #064e3b; color: #34d399; }
    .status-learning { background: #1e3a8a; color: #60a5fa; }
    .status-none { color: var(--text-muted); }
  </style>
</head>
<body>
  <header>
    <h1 style="display:inline-flex;align-items:center;gap:8px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);flex-shrink:0;"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
      ${title}
    </h1>
    <div class="badge">${doneCount}/${interactive.length} Completed (${pct}%)</div>
    <span style="font-size: 12px; color: var(--text-muted); margin-left: auto;">Offline Portable Bundle · 100% Self-Contained</span>
  </header>
  <div class="container">
    <div class="canvas-pane">
      ${svgString || '<p style="color:#000;">Interactive visual map</p>'}
    </div>
    <div class="sidebar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Filter topics...">
      </div>
      <div class="topic-list" id="topicList"></div>
    </div>
  </div>

  <script>
    const topics = ${topicsData};
    const listEl = document.getElementById('topicList');
    const inputEl = document.getElementById('searchInput');

    function render(filter = '') {
      listEl.innerHTML = '';
      const q = filter.trim().toLowerCase();
      const filtered = topics.filter(t => !q || t.label.toLowerCase().includes(q));

      filtered.forEach(t => {
        const row = document.createElement('div');
        row.className = 'topic-item';
        const stClass = t.status === 'done' ? 'status-done' : t.status === 'learning' ? 'status-learning' : 'status-none';
        const stLabel = t.status || 'unstarted';
        row.innerHTML = '<span>' + t.label + '</span><span class="status-tag ' + stClass + '">' + stLabel + '</span>';
        listEl.appendChild(row);
      });
    }

    inputEl.addEventListener('input', (e) => render(e.target.value));
    render();
  </script>
</body>
</html>`;
}

/**
 * Trigger browser file download helper.
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
