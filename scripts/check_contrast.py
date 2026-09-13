#!/usr/bin/env python3
"""WCAG contrast audit for the semantic token layer.

Parses the `oklch(...)` values out of app/src/index.css, converts them to sRGB,
and reports the contrast ratio of every foreground token against the surfaces it
is actually drawn on. Exits non-zero if a foreground/surface pair drops below
its target ratio.

Usage:  python scripts/check_contrast.py
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "app" / "src" / "index.css"


def oklch_to_srgb(L: float, C: float, h_deg: float) -> tuple[float, float, float]:
    """OKLCH -> linear sRGB -> gamma sRGB, clamped to [0,1]."""
    h = math.radians(h_deg)
    a = C * math.cos(h)
    b = C * math.sin(h)

    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b

    l, m, s = l_**3, m_**3, s_**3

    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def gamma(x: float) -> float:
        x = min(1.0, max(0.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * (x ** (1 / 2.4)) - 0.055

    return gamma(r), gamma(g), gamma(bb)


def rel_luminance(rgb: tuple[float, float, float]) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: tuple[float, float, float], bg: tuple[float, float, float]) -> float:
    l1, l2 = rel_luminance(fg), rel_luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


TOKEN_RE = re.compile(r"--(theme-[a-z0-9-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)")


def parse_themes() -> dict[str, dict[str, tuple[float, float, float]]]:
    css = CSS.read_text(encoding="utf-8")
    themes: dict[str, dict[str, tuple[float, float, float]]] = {}
    # Split on the [data-theme="x"] selectors.
    for block in re.split(r"\[data-theme=\"([a-z]+)\"\]\s*\{", css)[1:]:
        pass
    parts = re.split(r"\[data-theme=\"([a-z]+)\"\]\s*\{", css)
    for i in range(1, len(parts), 2):
        name, body = parts[i], parts[i + 1]
        body = body.split("}")[0]
        toks = {}
        for m in TOKEN_RE.finditer(body):
            toks[m.group(1)] = oklch_to_srgb(float(m.group(2)), float(m.group(3)), float(m.group(4)))
        themes[name] = toks
    return themes


# foreground token -> the surface token(s) it is drawn on, and the target ratio.
# 4.5 = body text, 3.0 = large text / non-text UI indicators and dots.
CHECKS: list[tuple[str, list[str], float]] = [
    ("theme-text", ["theme-bg", "theme-surface", "theme-surface-2"], 4.5),
    ("theme-text-muted", ["theme-bg", "theme-surface"], 4.5),
    ("theme-text-faint", ["theme-bg", "theme-surface"], 3.0),
    ("theme-primary", ["theme-bg", "theme-surface"], 3.0),
    ("theme-danger", ["theme-bg", "theme-surface", "theme-danger-soft"], 3.0),
    ("theme-note", ["theme-bg", "theme-surface", "theme-note-soft"], 3.0),
    ("theme-warning", ["theme-bg", "theme-surface", "theme-warning-soft"], 3.0),
    ("theme-done", ["theme-bg", "theme-surface"], 3.0),
    ("theme-learning", ["theme-bg", "theme-surface"], 3.0),
    ("theme-due", ["theme-bg", "theme-surface"], 3.0),
    # text drawn on a primary-filled button
    ("theme-primary-ink", ["theme-primary"], 4.5),
    # State ink on its own soft fill — this is the pairing every status chip,
    # badge and "done" pill uses. Without these entries a solid-fill/state-ink
    # mix-up (bg-done + text-done, i.e. an invisible label) passes silently;
    # four such bugs were found across FlashcardModal, TimeTracker,
    # AchievementsModal and ResourcesPanel during the redesign.
    ("theme-done", ["theme-done-soft"], 4.5),
    ("theme-learning", ["theme-learning-soft"], 4.5),
    ("theme-skipped", ["theme-skipped-soft"], 4.5),
    ("theme-due", ["theme-due-soft"], 4.5),
    ("theme-danger", ["theme-danger-soft"], 4.5),
    ("theme-note", ["theme-note-soft"], 4.5),
    ("theme-warning", ["theme-warning-soft"], 4.5),
    ("theme-primary", ["theme-primary-soft"], 4.5),
    # Habitica RPG meters (the deliberate loud exception) — the ink sits on the
    # meter's own fill.
    ("theme-primary-ink", ["theme-rpg"], 4.5),
    # Selected / focused states that draw a ring in the accent colour.
    ("theme-accent", ["theme-bg", "theme-surface"], 3.0),
]


def main() -> int:
    themes = parse_themes()
    if not themes:
        print("could not parse any themes from index.css", file=sys.stderr)
        return 2

    failures = 0
    for name, toks in themes.items():
        print(f"\n=== {name} ===")
        for fg, bgs, target in CHECKS:
            if fg not in toks:
                print(f"  MISSING TOKEN {fg}")
                failures += 1
                continue
            for bg in bgs:
                if bg not in toks:
                    print(f"  MISSING TOKEN {bg}")
                    failures += 1
                    continue
                ratio = contrast(toks[fg], toks[bg])
                ok = ratio >= target
                if not ok:
                    failures += 1
                print(
                    f"  {'OK  ' if ok else 'FAIL'} {fg:22s} on {bg:20s} "
                    f"{ratio:5.2f}:1  (need {target})"
                )

    print()
    if failures:
        print(f"{failures} contrast check(s) FAILED")
        return 1
    print("all contrast checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
