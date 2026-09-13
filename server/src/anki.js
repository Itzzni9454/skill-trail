/**
 * Anki Flashcard Deck Exporter
 *
 * Exports roadmaps and user topic notes into an Anki-compatible TSV format
 * ready for instant 1-click import into Anki Desktop and AnkiMobile.
 */

function cleanHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/\t/g, ' ')
    .replace(/\r?\n/g, '<br/>')
    .replace(/"/g, '""');
}

/**
 * Generate an Anki-importable TSV string for a roadmap.
 */
export function generateAnkiDeck(roadmap, nodeProgress = {}, nodeNotes = {}, findNodeContentFn = null) {
  const lines = [
    '#separator:tab',
    '#html:true',
    '#tags column:3',
  ];

  const slug = roadmap.slug || 'roadmap';
  const roadmapTitle = roadmap.title?.page || roadmap.title?.card || roadmap.slug || 'Developer Roadmap';
  const progress = nodeProgress[slug] || {};
  const notes = nodeNotes[slug] || {};

  const interactiveNodes = (roadmap.nodes || []).filter((n) =>
    ['topic', 'subtopic', 'label', 'todo', 'checklist'].includes(n.type),
  );

  for (const node of interactiveNodes) {
    const label = String(node.data?.label || node.id).trim();
    const status = progress[node.id] || 'unstarted';
    const userNote = notes[node.id] || '';
    const officialContent = findNodeContentFn ? findNodeContentFn(slug, node.id) : null;

    // Front: Question & Context
    const front = `<div style="text-align:center; font-family:sans-serif;">` +
      `<span style="font-size:11px; text-transform:uppercase; color:#0284c7; font-weight:bold; letter-spacing:1px;">${roadmapTitle}</span>` +
      `<h2 style="margin:10px 0; color:#0f172a; font-size:22px;">${label}</h2>` +
      `<p style="color:#64748b; font-size:13px;">Explain and demonstrate your understanding of this concept.</p>` +
      `</div>`;

    // Back: Notes & Guide
    let backContent = `<div style="font-family:sans-serif; line-height:1.6; color:#1e293b;">`;
    if (userNote.trim()) {
      backContent += `<div style="background:#f0fdf4; border-left:4px solid #10b981; padding:10px 14px; margin-bottom:12px; border-radius:4px;">` +
        `<strong style="color:#15803d; font-size:12px; text-transform:uppercase;">Personal Study Notes</strong>` +
        `<div style="margin-top:6px; font-size:14px;">${cleanHtml(userNote)}</div>` +
        `</div>`;
    }
    if (officialContent) {
      backContent += `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:6px; font-size:13px;">` +
        `<strong style="color:#334155; font-size:12px; text-transform:uppercase;">Official Reference Guide</strong>` +
        `<div style="margin-top:8px;">${cleanHtml(officialContent.slice(0, 3000))}</div>` +
        `</div>`;
    }
    if (!userNote.trim() && !officialContent) {
      backContent += `<p style="color:#94a3b8; font-style:italic;">No reference material saved yet. Review official docs for <strong>${label}</strong>.</p>`;
    }
    backContent += `</div>`;

    const cleanFront = front.replace(/\t/g, ' ').replace(/\r?\n/g, '');
    const cleanBack = backContent.replace(/\t/g, ' ').replace(/\r?\n/g, '');
    const tagList = `roadmap::${slug} status::${status}`;

    lines.push(`${cleanFront}\t${cleanBack}\t${tagList}`);
  }

  return lines.join('\n');
}
