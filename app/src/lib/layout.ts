/**
 * Overlap removal for box layouts (mindmap radial rings, universe force
 * graph). Standard collision relaxation: for every overlapping pair, push the
 * two boxes apart along the axis that needs the least movement, half each.
 * Iterated to convergence the graph keeps its shape while every box gets clear
 * space. Deterministic — pairs are visited in index order.
 */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Desired gap between two boxes on the separating axis. */
const MARGIN = 14;
/** Damping keeps long push-chains from oscillating. */
const DAMP = 0.9;

/**
 * Resolve overlaps in-place. `maxIters` is high enough for chains (box A
 * pushed into B pushed into C…) to settle; layout sizes here are small
 * (≤ ~1k boxes), so the O(n²·iters) sweep stays in the low milliseconds.
 */
export function resolveOverlaps(boxes: Box[], maxIters = 24): void {
  for (let it = 0; it < maxIters; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX <= 0 || overlapY <= 0) continue; // not actually colliding
        // shift needed on each axis to fully separate + margin
        const needX = overlapX + MARGIN;
        const needY = overlapY + MARGIN;
        const midAx = a.x + a.w / 2;
        const midAy = a.y + a.h / 2;
        const midBx = b.x + b.w / 2;
        const midBy = b.y + b.h / 2;
        if (needX <= needY) {
          const dir = midAx <= midBx ? -1 : 1; // a moves left of b (or vice versa)
          const push = (needX / 2) * DAMP;
          a.x += dir * push;
          b.x -= dir * push;
        } else {
          const dir = midAy <= midBy ? -1 : 1; // a moves above b (or vice versa)
          const push = (needY / 2) * DAMP;
          a.y += dir * push;
          b.y -= dir * push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}
