"""Extract the COMPLETE rendered attribute map of one official roadmap.

Produces a compact JSON mapping node-id -> rendered attrs, used to derive
and later verify our offline renderer against the official one.

Run: python scripts/extract_official_svg.py [slug]
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

SLUG = sys.argv[1] if len(sys.argv) > 1 else "frontend"
OUT = f"scripts/official_rendered_{SLUG}.json"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.goto(f"https://roadmap.sh/{SLUG}", timeout=60000)
        page.wait_for_selector("[data-node-id]", state="attached", timeout=60000)
        time.sleep(5)

        dump = page.evaluate(
            r"""() => {
              const svg = document.querySelector('svg[viewBox*="-"]');
              const out = { nodes: {}, edges: {}, svgViewBox: null, font: null };
              if (!svg) return out;
              out.svgViewBox = svg.getAttribute('viewBox');
              out.font = svg.getAttribute('style');

              // ---- nodes: full rendered attributes ----
              for (const g of svg.querySelectorAll('[data-node-id]')) {
                const id = g.getAttribute('data-node-id');
                const rect = g.querySelector('rect');
                const texts = [...g.querySelectorAll('text')];
                const tspans = [];
                for (const t of texts) {
                  for (const ts of t.querySelectorAll('tspan')) {
                    tspans.push({
                      x: ts.getAttribute('x'), y: ts.getAttribute('y'),
                      dx: ts.getAttribute('dx'), dy: ts.getAttribute('dy'),
                      anchor: ts.getAttribute('text-anchor'),
                      baseline: ts.getAttribute('dominant-baseline'),
                      fontSize: ts.getAttribute('font-size'),
                      fill: ts.getAttribute('fill'),
                      content: ts.textContent,
                    });
                  }
                  if (t.childNodes.length && !t.querySelector('tspan')) {
                    tspans.push({ content: t.textContent, parentTextAttrs: {
                      x: t.getAttribute('x'), y: t.getAttribute('y'),
                      anchor: t.getAttribute('text-anchor'),
                    }});
                  }
                }
                out.nodes[id] = {
                  type: g.getAttribute('data-type'),
                  title: g.getAttribute('data-title'),
                  parentId: g.getAttribute('data-parent-id'),
                  parentTitle: g.getAttribute('data-parent-title'),
                  rect: rect ? {
                    x: rect.getAttribute('x'), y: rect.getAttribute('y'),
                    w: rect.getAttribute('width'), h: rect.getAttribute('height'),
                    rx: rect.getAttribute('rx'),
                    fill: rect.getAttribute('fill'),
                    stroke: rect.getAttribute('stroke'),
                    strokeWidth: rect.getAttribute('stroke-width'),
                    style: rect.getAttribute('style'),
                  } : null,
                  texts: tspans,
                  extraHtml: g.innerHTML.length > 2000 ? g.innerHTML.slice(0, 2000) : undefined,
                };
              }

              // ---- edges: rendered path data (data-edge-id is ON the <path>) ----
              let i = 0;
              for (const pt of svg.querySelectorAll('[data-edge-id]')) {
                out.edges[pt.getAttribute('data-edge-id') || `edge-${i++}`] = {
                  d: pt.getAttribute('d'),
                  stroke: pt.getAttribute('stroke'),
                  strokeWidth: pt.getAttribute('stroke-width'),
                  strokeDasharray: pt.getAttribute('stroke-dasharray'),
                  strokeLinecap: pt.getAttribute('stroke-linecap'),
                  markerEnd: pt.getAttribute('marker-end'),
                };
              }

              // ---- legend box ----
              const legendG = [...svg.querySelectorAll('g')].find(g => /Personal Recommendation/i.test(g.textContent || ''));
              out.legend = legendG ? legendG.outerHTML.slice(0, 6000) : null;

              return out;
            }"""
        )

        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(dump, f, indent=1)
        print(f"nodes: {len(dump.get('nodes', {}))}, edges: {len(dump.get('edges', {}))}")
        print(f"saved -> {OUT}")
        browser.close()


if __name__ == "__main__":
    main()
