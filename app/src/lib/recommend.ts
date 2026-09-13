/**
 * "What should I learn next?"
 *
 * Uses data the app already has — the roadmap graphs and cross-roadmap
 * coverage — rather than any new model. A topic scores well when:
 *   - its prerequisites are already done (it is genuinely unlocked)
 *   - the same topic is already done in *another* roadmap, so the knowledge
 *     transfers and it is cheap to pick up
 *   - it sits in a roadmap you have started, so it builds momentum instead of
 *     scattering attention
 *   - its siblings are done, so you are already deep in that branch
 */
import type { NodeStatus, ProgressMap, Roadmap } from './types';

export interface Suggestion {
  slug: string;
  nodeId: string;
  label: string;
  roadmapTitle: string;
  reason: string;
  score: number;
}

const isTopic = (t?: string) => t === 'topic' || t === 'subtopic';

/** Normalized label key, matching cross.ts. */
const key = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * @param roadmaps  Full roadmaps (nodes + edges) to consider.
 * @param progress  Progress per roadmap slug.
 * @param limit     How many suggestions to return.
 */
export function recommendNext(
  roadmaps: Roadmap[],
  progress: Record<string, ProgressMap>,
  limit = 4,
): Suggestion[] {
  // Labels already done anywhere — picking these up elsewhere is cheap.
  const doneLabels = new Set<string>();
  for (const [slug, prog] of Object.entries(progress)) {
    const rm = roadmaps.find((r) => r.slug === slug);
    if (!rm) continue;
    for (const n of rm.nodes) {
      if (!isTopic(n.type)) continue;
      if (prog[n.id] === 'done') doneLabels.add(key(n.data?.label || ''));
    }
  }

  const out: Suggestion[] = [];

  for (const rm of roadmaps) {
    const slug = rm.slug || '';
    const prog = progress[slug] || {};
    const started = Object.keys(prog).length > 0;
    if (!started) continue; // only continue what you have begun

    // parent -> children, so we can test whether prerequisites are done
    const parents = new Map<string, string[]>();
    const children = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, k: string, v: string) => {
      const arr = m.get(k);
      if (arr) arr.push(v);
      else m.set(k, [v]);
    };
    for (const e of rm.edges || []) {
      push(parents, e.target, e.source);
      push(children, e.source, e.target);
    }

    for (const n of rm.nodes) {
      if (!isTopic(n.type)) continue;
      const status: NodeStatus | undefined = prog[n.id];
      if (status === 'done' || status === 'skipped') continue;

      const label = n.data?.label || n.id;
      let score = 0;
      const reasons: string[] = [];

      const prereqs = parents.get(n.id) || [];
      const prereqNodes = prereqs
        .map((id) => rm.nodes.find((x) => x.id === id))
        .filter((x) => x && isTopic(x.type));
      if (prereqNodes.length && prereqNodes.every((p) => prog[p!.id] === 'done')) {
        score += 4;
        reasons.push('prerequisites done');
      }

      if (doneLabels.has(key(label))) {
        score += 3;
        reasons.push('you know this from another roadmap');
      }

      const sibs = children.get(
        prereqs[0] ?? '',
      ) || [];
      const sibDone = sibs.filter((id) => prog[id] === 'done').length;
      if (sibDone > 0) {
        score += Math.min(2, sibDone);
        reasons.push(`${sibDone} sibling${sibDone === 1 ? '' : 's'} done`);
      }

      if (status === 'learning') {
        score += 2;
        reasons.push('already in progress');
      }

      if (score <= 0) continue;
      out.push({
        slug,
        nodeId: n.id,
        label,
        roadmapTitle: rm.title?.page || rm.title?.card || slug,
        reason: reasons.slice(0, 2).join(' · '),
        score,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  // One suggestion per roadmap keeps the list varied rather than five items
  // from whichever roadmap happens to be furthest along.
  const perRoadmap = new Set<string>();
  const picked: Suggestion[] = [];
  for (const s of out) {
    if (perRoadmap.has(s.slug)) continue;
    perRoadmap.add(s.slug);
    picked.push(s);
    if (picked.length >= limit) break;
  }
  return picked;
}
