/**
 * Cross-roadmap coverage: a topic done in one roadmap that shares its label
 * with topics in other roadmaps shows as "covered" (done-by-default) there.
 * Pure label-based matching — no server roundtrip, works on already-loaded
 * roadmaps.
 */
import type { NodeStatus, ProgressMap, Roadmap } from './types';

/** Normalized match key for a topic label. */
function normKey(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Outline style per display status — shared by every roadmap surface
 * (RoadmapSVG, mindmap, universe). Solid emerald = done, dashed blue =
 * learning, dashed gray = skipped, dotted sky = covered elsewhere.
 */
export const STATUS_OUTLINE: Record<
  'done' | 'learning' | 'skipped' | 'covered',
  { stroke: string; dash?: string }
> = {
  done: { stroke: '#10b981' },
  learning: { stroke: '#3b82f6', dash: '7 4' },
  skipped: { stroke: '#6b7280', dash: '4 4' },
  covered: { stroke: '#0ea5e9', dash: '2 4' },
};

/**
 * Compute a covered-status map for one roadmap: every node whose label matches
 * a topic marked done in ANY OTHER roadmap becomes 'covered'. Only topic and
 * subtopic nodes participate. O(nodes + progress entries).
 */
export function coveredStatusMap(
  slug: string,
  allRoadmaps: Map<string, Roadmap>,
  allProgress: Record<string, Record<string, NodeStatus>>,
): ProgressMap {
  const doneKeys = new Map<string, { fromSlug: string; label: string }>();
  for (const [otherSlug, prog] of Object.entries(allProgress)) {
    if (otherSlug === slug) continue;
    const rm = allRoadmaps.get(otherSlug);
    if (!rm) continue; // progress for a roadmap we haven't loaded — can't get labels
    for (const n of rm.nodes) {
      if (['topic', 'subtopic', 'todo'].includes(n.type)) {
        if (prog[n.id] === 'done') {
          const key = normKey(n.data?.label || '');
          if (key && !doneKeys.has(key)) doneKeys.set(key, { fromSlug: otherSlug, label: n.data?.label || '' });
        }
      } else if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
        for (const it of n.data.checklists) {
          if (prog[it.id] === 'done') {
            const key = normKey(it.label || '');
            if (key && !doneKeys.has(key)) doneKeys.set(key, { fromSlug: otherSlug, label: it.label || '' });
          }
        }
      }
    }
  }
  const covered: ProgressMap = {};
  if (!doneKeys.size) return covered;
  const rm = allRoadmaps.get(slug);
  if (!rm) return covered;
  for (const n of rm.nodes) {
    if (['topic', 'subtopic', 'todo'].includes(n.type)) {
      const key = normKey(n.data?.label || '');
      if (key && doneKeys.has(key)) covered[n.id] = 'covered';
    } else if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
      for (const it of n.data.checklists) {
        const key = normKey(it.label || '');
        if (key && doneKeys.has(key)) covered[it.id] = 'covered';
      }
    }
  }
  return covered;
}

/** All other roadmaps where a label is marked done — for "covered by" hints. */
export function doneElsewhereFor(
  label: string,
  slug: string,
  allRoadmaps: Map<string, Roadmap>,
  allProgress: Record<string, Record<string, NodeStatus>>,
): { slug: string; title: string }[] {
  const key = normKey(label || '');
  if (!key) return [];
  const hits: { slug: string; title: string }[] = [];
  for (const [otherSlug, rm] of allRoadmaps) {
    if (otherSlug === slug) continue;
    const prog = allProgress[otherSlug] || {};
    for (const n of rm.nodes) {
      if (['topic', 'subtopic', 'todo'].includes(n.type)) {
        if (prog[n.id] !== 'done') continue;
        if (normKey(n.data?.label || '') === key) {
          hits.push({ slug: otherSlug, title: rm.title?.page || otherSlug });
          break;
        }
      } else if (n.type === 'checklist' && Array.isArray(n.data?.checklists)) {
        let found = false;
        for (const it of n.data.checklists) {
          if (prog[it.id] === 'done' && normKey(it.label || '') === key) {
            hits.push({ slug: otherSlug, title: rm.title?.page || otherSlug });
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  }
  return hits;
}
