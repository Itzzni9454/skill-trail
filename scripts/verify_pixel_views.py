"""Pixel-level visual verification.

Re-frames the roadmap SVG viewBox onto target regions (legend box, ticked
node) so sampling happens at full resolution, checks:
  - legend box interior is white, icon keeps its color
  - node legend ticks sit ON the node border (not centered)
  - Universe view (merged + official layout): no text overflow
  - Mindmap view: no text overflow

Saves screenshots to scripts/verify_*.png.
Run: python scripts/verify_pixel_views.py
"""
import io
import time

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4177"

GENERIC_OVERFLOW_JS = r"""() => {
  // For every rect that has a sibling/child text, measure the text ink extent
  // and flag if more than 2px of ink lies outside the rect. Decorative dashed
  // containers (cluster frames) only need their title inside the CELL.
  const svg = document.querySelector('svg');
  if (!svg) return { error: 'no svg' };
  const bad = [];
  for (const g of svg.querySelectorAll('g')) {
    const r = g.querySelector(':scope > rect');
    const t = g.querySelector(':scope > text');
    if (!r || !t) continue;
    const rect = { x: +r.getAttribute('x'), y: +r.getAttribute('y'),
                   w: +r.getAttribute('width'), h: +r.getAttribute('height') };
    const isDecorativeContainer = rect.w > 800 && r.getAttribute('fill') === 'none';
    const bb = t.getBBox();
    if (bb.width === 0) continue;
    if (isDecorativeContainer) {
      const adv = t.getComputedTextLength();
      const left = bb.x + bb.width - adv; // pen x
      const right = left + adv;
      if (left < rect.x - 30 || right > rect.x + rect.w + 40)
        bad.push({ ox: +Math.max(rect.x - 30 - left, right - (rect.x + rect.w + 40)).toFixed(1), oy: 0,
                   label: t.textContent.slice(0, 30) });
      continue;
    }
    const ox = Math.max(0, bb.x + bb.width - (rect.x + rect.w)) + Math.max(0, rect.x - bb.x);
    const oy = Math.max(0, bb.y + bb.height - (rect.y + rect.h)) + Math.max(0, rect.y - bb.y);
    if (ox > 2 || oy > 6)
      bad.push({ ox: +ox.toFixed(1), oy: +oy.toFixed(1), label: t.textContent.slice(0, 30) });
  }
  return { count: bad.length, bad: bad.slice(0, 10) };
}"""


def main() -> None:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 1000})

        def pixel_at(x, y):
            img = pg.screenshot(clip={"x": x - 0.5, "y": y - 0.5, "width": 1, "height": 1})
            return "#%02x%02x%02x" % Image.open(io.BytesIO(img)).convert("RGB").getpixel((0, 0))

        def sample_region(region):
            pg.evaluate(
                """(r) => {
              const svg = document.querySelector('svg');
              svg.setAttribute('data-vb-orig', svg.getAttribute('viewBox'));
              svg.setAttribute('viewBox', `${r.bbx} ${r.bby} ${r.bbw} ${r.bbh}`);
            }""",
                region,
            )
            time.sleep(0.4)

        def restore_region():
            pg.evaluate(
                """() => {
              const svg = document.querySelector('svg');
              const vb = svg.getAttribute('data-vb-orig');
              if (vb) { svg.setAttribute('viewBox', vb); svg.removeAttribute('data-vb-orig'); }
            }"""
            )
            time.sleep(0.4)

        fails = []

        # ---------------- roadmap view: zoomed pixel sampling ----------------
        pg.goto(f"{BASE}/#/roadmap/frontend", timeout=30000)
        pg.wait_for_selector("[data-node-id]", state="attached", timeout=20000)
        time.sleep(2)

        # 1) legend box: white interior, colored icon
        leg = pg.evaluate(
            r"""() => {
          const g = document.querySelector('[data-type="legend"]');
          if (!g) return null;
          const bb = g.getBBox();
          const icon = g.querySelector('circle');
          return { bbx: bb.x, bby: bb.y, bbw: bb.width, bbh: bb.height,
                   iconFill: icon && icon.getAttribute('fill') };
        }"""
        )
        if leg:
            sample_region(leg)
            r = pg.evaluate(
                r"""() => {
              const rect = document.querySelector('[data-type="legend"] rect');
              const cr = rect.getBoundingClientRect();
              return { x: cr.x, y: cr.y, w: cr.width, h: cr.height };
            }"""
            )
            whites = 0
            total = 0
            for ddx in range(6, 34, 4):
                for ddy in range(6, 34, 4):
                    col = pixel_at(r["x"] + ddx, r["y"] + ddy)
                    total += 1
                    if col in ("#ffffff", "#fefefe", "#fffefe"):
                        whites += 1
            print(f"legend box interior: {whites}/{total} white samples, icon fill: {leg['iconFill']}")
            if whites < total * 0.8:
                fails.append(f"legend box interior not white ({whites}/{total})")
            if not leg["iconFill"] or leg["iconFill"] == "#ffffff":
                fails.append("legend icon has no color")
            restore_region()

        # 2) ticked node: tick pixel on border colored, node center not white
        tick_info = pg.evaluate(
            r"""() => {
          for (const g of document.querySelectorAll('[data-node-id]')) {
            const type = g.getAttribute('data-type');
            if (type === 'legend' || type === 'linksgroup') continue;
            const c = [...g.querySelectorAll('circle')].find(c => Math.abs(+c.getAttribute('r') - 9.5) < 0.01);
            if (!c) continue;
            const bb = g.getBBox();
            return { bbx: bb.x - 10, bby: bb.y - 10, bbw: bb.width + 20, bbh: bb.height + 20,
                     tickFill: c.getAttribute('fill'),
                     tick: { x: +c.getAttribute('cx'), y: +c.getAttribute('cy') } };
          }
          return null;
        }"""
        )
        if tick_info:
            sample_region(tick_info)
            pts = pg.evaluate(
                r"""(t) => {
              const svg = document.querySelector('svg');
              const pt = svg.createSVGPoint();
              const toScreen = (ux, uy) => { pt.x = ux; pt.y = uy; return pt.matrixTransform(svg.getScreenCTM()); };
              const tickS = toScreen(t.tick.x, t.tick.y);
              // rect of the SAME group that owns the tick
              const g = [...document.querySelectorAll('[data-node-id]')].find(e =>
                [...e.querySelectorAll('circle')].some(c => Math.abs(+c.getAttribute('r') - 9.5) < 0.01));
              const rr = g.querySelector('rect').getBoundingClientRect();
              return { tick: { x: tickS.x, y: tickS.y },
                       nodeCenter: { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2 } };
            }""",
                tick_info,
            )
            tick_col = pixel_at(pts["tick"]["x"], pts["tick"]["y"])
            center_col = pixel_at(pts["nodeCenter"]["x"], pts["nodeCenter"]["y"])
            print(f"node tick pixel: {tick_col} (expect ~{tick_info['tickFill']}), node center: {center_col} (expect not white)")
            if not tick_col or tick_col == "#ffffff":
                fails.append("node tick not visible on border")
            if center_col == "#ffffff":
                fails.append("node center is white — tick may be centered (old bug)")
            restore_region()

        pg.screenshot(path="scripts/verify_roadmap_fixed.png")

        # ---------------- universe view ----------------
        pg.goto(f"{BASE}/#/universe", timeout=30000)
        time.sleep(1)
        boxes = pg.query_selector_all("aside input[type=checkbox]")
        for cb in boxes[:2]:
            cb.check()
        pg.click("text=Render")
        time.sleep(3)
        res = pg.evaluate(GENERIC_OVERFLOW_JS)
        print("universe merged overflow:", res)
        if res.get("count"):
            fails.append(f"universe merged: {res['count']} overflow groups")
        pg.screenshot(path="scripts/verify_universe_merged.png")

        pg.click("text=Official layout")
        time.sleep(2)
        res = pg.evaluate(GENERIC_OVERFLOW_JS)
        print("universe clusters overflow:", res)
        if res.get("count"):
            fails.append(f"universe clusters: {res['count']} overflow groups")
        pg.screenshot(path="scripts/verify_universe_clusters.png")

        # ---------------- mindmap view ----------------
        pg.goto(f"{BASE}/#/mindmap/frontend", timeout=30000)
        pg.wait_for_selector("svg", state="attached", timeout=20000)
        time.sleep(2)
        res = pg.evaluate(GENERIC_OVERFLOW_JS)
        print("mindmap overflow:", res)
        if res.get("count"):
            fails.append(f"mindmap: {res['count']} overflow groups")
        pg.screenshot(path="scripts/verify_mindmap.png")

        b.close()
        print()
        print("PIXEL/VIEW RESULT:", "PASS" if not fails else "FAIL")
        for f in fails:
            print("  !!", f)


if __name__ == "__main__":
    main()
