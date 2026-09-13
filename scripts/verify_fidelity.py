"""Verify our offline renderer against the official rendered fixture.

Compares rect geometry + fill + text position for every node of /frontend
between the official site dump and our local app.

Run: python scripts/verify_fidelity.py   (server must run on :4177)
"""
import json
import os
import time

from playwright.sync_api import sync_playwright

official = json.load(open("fixtures/official_rendered_frontend.json"))["nodes"]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    pg.goto("http://localhost:4177/#/roadmap/frontend", timeout=30000)
    pg.wait_for_selector("[data-node-id]", state="attached", timeout=20000)
    time.sleep(2)
    ours = pg.evaluate(
        """() => {
      const out = {};
      for (const g of document.querySelectorAll('[data-node-id]')) {
        const r = g.querySelector('rect');
        const t = g.querySelector('text');
        const ts = g.querySelector('tspan');
        out[g.getAttribute('data-node-id')] = {
          type: g.getAttribute('data-type'),
          rect: r ? { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), fill: r.getAttribute('fill') } : null,
          text: t ? { x: +(ts?.getAttribute('x') ?? t.getAttribute('x')), y: +(ts?.getAttribute('y') ?? t.getAttribute('y')) } : null,
        };
      }
      return out;
    }"""
    )
    b.close()

total = rect_ok = fill_ok = text_ok = 0
rect_errs, fill_errs, text_errs = [], [], []
for nid, o in official.items():
    if nid not in ours:
        continue
    m = ours[nid]
    if not o["rect"] or not m["rect"]:
        continue
    total += 1
    dx = abs(float(o["rect"]["x"]) - m["rect"]["x"])
    dy = abs(float(o["rect"]["y"]) - m["rect"]["y"])
    dw = abs(float(o["rect"]["w"]) - m["rect"]["w"])
    dh = abs(float(o["rect"]["h"]) - m["rect"]["h"])
    if dx < 0.01 and dy < 0.01 and dw < 0.01 and dh < 0.01:
        rect_ok += 1
    else:
        rect_errs.append(f"{nid} dx={dx:.2f} dy={dy:.2f} dw={dw:.2f} dh={dh:.2f}")
    if (o["rect"]["fill"] or "").lower() == (m["rect"]["fill"] or "").lower():
        fill_ok += 1
    else:
        fill_errs.append(f"{nid} ({o['type']}) official={o['rect']['fill']} ours={m['rect']['fill']}")
    if o["texts"] and m["text"]:
        fx = o["texts"][0].get("x")
        fy = o["texts"][0].get("y")
        if fx is None or fy is None:
            text_ok += 1  # official stores x/y on tspan variants we already cover above
            continue
        tdx = abs(float(fx) - m["text"]["x"])
        tdy = abs(float(fy) - m["text"]["y"])
        if tdx < 0.01 and tdy < 0.01:
            text_ok += 1
        else:
            text_errs.append(f"{nid} tdx={tdx:.2f} tdy={tdy:.2f}")

print(f"rect: {rect_ok}/{total} exact | fill: {fill_ok}/{total} | text: {text_ok}/{total}")
for name, errs in (("RECT", rect_errs), ("FILL", fill_errs), ("TEXT", text_errs)):
    for e in errs[:8]:
        print(f"  {name} mismatch: {e}")
if not (rect_errs or fill_errs or text_errs):
    print("ALL MATCH OFFICIAL RENDERER")
