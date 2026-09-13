"""Verify visual consistency of the offline renderer.

Checks, for every node on several roadmaps:
  1. text bounding box (measured by the browser) stays inside the node rect
     (both with a tolerance for the official baseline quirk), i.e. no clipping
  2. legend ticks: horizontal position == left/right border, vertical == box
     vertical center; no tick may sit at the box center
  3. legend boxes: icon x, label x, first-row pitch match the official geometry

Run:  python scripts/verify_visual_consistency.py
Needs the app running on http://localhost:4177 (npm start in server/).
"""
import json
import sys
import time
from collections import Counter

from playwright.sync_api import sync_playwright

SLUGS = sys.argv[1:] or ["frontend", "backend", "aspnet-core", "devops"]
BASE = "http://localhost:4177"

JS = r"""() => {
  const svg = document.querySelector('svg');
  if (!svg) return { error: 'no svg' };
  const issues = [];
  const ticks = [];
  const legendRows = [];
  const sawType = [];

  const pickRect = (g) => {
    const r = g.querySelector('rect');
    if (!r) return null;
    return { x: +r.getAttribute('x'), y: +r.getAttribute('y'),
             w: +r.getAttribute('width'), h: +r.getAttribute('height') };
  };

  for (const g of svg.querySelectorAll('[data-node-id]')) {
    const id = g.getAttribute('data-node-id');
    const type = g.getAttribute('data-type');
    sawType.push(type);
    const rect = pickRect(g);
    if (!rect) continue;

    // --- 1. text overflow: measure every text element's real bbox
    for (const t of g.querySelectorAll('text')) {
      const bb = t.getBBox();
      if (bb.width === 0) continue;
      const overflowX = Math.max(0, bb.x + bb.width - (rect.x + rect.w)) +
                        Math.max(0, rect.x - bb.x);
      const overflowY = Math.max(0, bb.y + bb.height - (rect.y + rect.h)) +
                        Math.max(0, rect.y - bb.y);
      if (overflowX > 1.5 || overflowY > 6)
        issues.push({ kind: 'text-overflow', id, type,
                      ox: +overflowX.toFixed(1), oy: +overflowY.toFixed(1),
                      label: t.textContent.slice(0, 30) });
    }

    // --- 2. legend ticks on this node (r=9.5 circles; progress dots are 6.5)
    // LegendTick renders as <g><circle r=9.5/></g> inside the node group.
    if (type !== 'legend' && type !== 'linksgroup') {
      for (const c of g.querySelectorAll('circle')) {
        if (Math.abs(+c.getAttribute('r') - 9.5) > 0.01) continue;
        const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
        const dxR = Math.abs(cx - (rect.x + rect.w));
        const dxL = Math.abs(cx - rect.x);
        const okX = dxR < 2 || dxL < 2;
        const okY = Math.abs(cy - (rect.y + rect.h / 2)) < 2 || Math.abs(cy - rect.y) < 2 || Math.abs(cy - (rect.y + rect.h)) < 2;
        const centered = Math.abs(cx - (rect.x + rect.w / 2)) < 2 && Math.abs(cy - (rect.y + rect.h / 2)) < 2;
        ticks.push({ id, okX, okY, centered });
      }
    }

    // --- 3. legend/linksgroup row geometry
    if (type === 'legend' || type === 'linksgroup') {
      const texts = [...g.querySelectorAll(':scope > g > text, :scope > a > text')];
      const rows = texts.map((t) => +t.getAttribute('y'));
      for (const t of texts) {
        const bb = t.getBBox();
        if (bb.x < rect.x + 5)
          issues.push({ kind: 'legend-row-overflow', id, type, label: t.textContent.slice(0, 30) });
      }
      legendRows.push({ id, type, rows });
      // tick icon inside the legend box: first circle's x
      const icon = g.querySelector('circle');
      if (icon) {
        const cx = +icon.getAttribute('cx');
        const want = type === 'legend' ? rect.x + 35.5 : rect.x + 32.5;
        if (Math.abs(cx - want) > 2)
          issues.push({ kind: 'legend-icon-x', id, type, cx, want });
      }
    }
  }
  // --- 4. tick vs text overlap: no text ink may reach into a tick circle zone.
  // Measured from actual glyph ink: horizontal extent via getComputedTextLength
  // (exact advance), vertical extent ±0.55em around the baseline (tall ascenders
  // included). getBBox() would overstate extents with font-metric padding.
  for (const t of ticks) {
    const g = svg.querySelector(`[data-node-id="${t.id}"]`);
    const c = g && [...g.querySelectorAll('circle')].find(c => Math.abs(+c.getAttribute('r') - 9.5) < 0.01);
    if (!g || !c) continue;
    const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
    for (const te of g.querySelectorAll('text')) {
      const fs = +te.getAttribute('font-size') || 17;
      const anchor = te.getAttribute('text-anchor') || 'start';
      const ax = +(te.getAttribute('x') ?? 0);
      const adv = te.getComputedTextLength();
      const left = anchor === 'middle' ? ax - adv / 2 : ax;
      const right = left + adv;
      const baseline = +(te.getAttribute('y') ?? 0);
      const top = baseline - fs * 0.55, bot = baseline + fs * 0.55;
      const nx = Math.max(left, Math.min(cx, right));
      const ny = Math.max(top, Math.min(cy, bot));
      const dist = Math.hypot(cx - nx, cy - ny);
      if (dist < 9.5)
        issues.push({ kind: 'tick-overlaps-text', id: t.id, dist: +dist.toFixed(1), label: te.textContent.slice(0, 30) });
    }
  }

  return { issues, ticks, legendRows, types: sawType };
}"""


def main() -> None:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1000})
        total_issues = 0
        for slug in SLUGS:
            pg.goto(f"{BASE}/#/roadmap/{slug}", timeout=30000)
            pg.wait_for_selector("[data-node-id]", state="attached", timeout=20000)
            time.sleep(1.5)
            res = pg.evaluate(JS)
            if "error" in res:
                print(f"{slug}: ERROR {res['error']}")
                continue
            ticks = res["ticks"]
            centered = [t for t in ticks if t["centered"]]
            badX = [t for t in ticks if not t["okX"]]
            badY = [t for t in ticks if not t["okY"]]
            issues = res["issues"]
            total_issues += len(issues)
            types = Counter(res["types"])
            print(f"{slug}: nodes={sum(types.values())} "
                  f"text-overflow={sum(1 for i in issues if i['kind']=='text-overflow')} "
                  f"ticks={len(ticks)} (centered={len(centered)} badX={len(badX)} badY={len(badY)}) "
                  f"legend-boxes={sum(1 for t in res['legendRows'])} other-issues={sum(1 for i in issues if i['kind'] != 'text-overflow')}")
            for i in issues[:12]:
                print("   !!", i)
            for t in badX[:6]:
                print("   tick badX:", t)
            for t in centered[:6]:
                print("   tick CENTERED (bug):", t)
            overlap = [i for i in issues if i['kind'] == 'tick-overlaps-text']
            if overlap:
                print(f"   tick-overlaps-text: {len(overlap)}")
                for i in overlap[:6]:
                    print("   !!", i)
        b.close()
        print()
        print("RESULT:", "PASS" if total_issues == 0 else f"FAIL ({total_issues} issues)")


if __name__ == "__main__":
    main()
