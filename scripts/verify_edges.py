"""Edge-geometry regression check against the official rendered fixture.

A faithful port of app/src/lib/renderer.ts geometry (nodeSize / ensureNodeSized /
handlePoint / edgePath) so it can run without a browser. Compares every edge of a
roadmap against fixtures/official_rendered_frontend.json.

Run:  python scripts/verify_edges.py [slug]
Exit: 0 when every edge matches the official path, 1 otherwise.

This is the automated guard for the project's core fidelity promise — it does NOT
need the dev server or Playwright (unlike verify_fidelity.py).
"""
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(ROOT, 'fixtures', 'official_rendered_frontend.json')

# Advance widths (1/100 em) of the official Balsamiq Sans, from renderer.ts.
ADVANCES = {
    ' ': 26.99,
    '0': 58.81, '1': 38.71, '2': 59, '3': 61.5, '4': 61, '5': 57.3, '6': 61.11,
    '7': 49.1, '8': 58.31, '9': 57.8,
    'a': 56.61, 'b': 56.31, 'c': 53.21, 'd': 57.3, 'e': 59.3, 'f': 30.9,
    'g': 57.71, 'h': 55.3, 'i': 23.41, 'j': 27.2, 'k': 49.86, 'l': 22.31,
    'm': 82.69, 'n': 56.4, 'o': 56.81, 'p': 58.01, 'q': 58.4, 'r': 38.53,
    's': 49.51, 't': 30.7, 'u': 55.71, 'v': 49.86, 'w': 68.23, 'x': 46.8,
    'y': 46.46, 'z': 49.86,
    'A': 61.2, 'B': 68.51, 'C': 71.1, 'D': 72.9, 'E': 65.91, 'F': 60.06,
    'G': 75.01, 'H': 73.1, 'I': 31.01, 'J': 54.4, 'K': 65.73, 'L': 57.8,
    'M': 86.31, 'N': 75.2, 'O': 76.2, 'P': 62.9, 'Q': 78.2, 'R': 71.1,
    'S': 60.51, 'T': 60.1, 'U': 73.2, 'V': 61.8, 'W': 91.11, 'X': 57.8,
    'Y': 60.06, 'Z': 63.46,
    '.': 19.51, ',': 18.2, '!': 20.91, '?': 50.7, "'": 22.4, '"': 37.31,
    '-': 36.6, '&': 66.3, '/': 45.21, '(': 36, ')': 37.1, ':': 20.2,
    ';': 20.61, '+': 66.9, '#': 64.3, '%': 94.4, '*': 46.71, '@': 92.2,
    '_': 68, '$': 71.1, '=': 71.5, '[': 37.5, ']': 34.21, '<': 69.7,
    '>': 76.11, '~': 70.41, '`': 21.53, '^': 52.7, '|': 20.51, '{': 42.6,
    '}': 42.8, '\\': 42.41,
}

TOL = 0.01


def measure_text(text, font_size):
    return sum(ADVANCES.get(ch, 50) for ch in text) * font_size / 100


def node_size(node):
    w = node.get('width') or (node.get('measured') or {}).get('width')
    h = node.get('height') or (node.get('measured') or {}).get('height')
    if w and h:
        return w, h
    # Mirror ensureNodeSized()'s inference for nodes shipped without dimensions.
    data = node.get('data') or {}
    label = (data.get('label') or '').strip()
    font_size = (data.get('style') or {}).get('fontSize') or (
        28 if node.get('type') == 'title' else 17)
    if node.get('type') == 'label':
        return math.ceil(measure_text(label, font_size)) + 20, 38
    if node.get('type') == 'paragraph':
        style_w = (data.get('style') or {}).get('width') or 380
        return min(430, max(120, style_w)), 49
    return w or 240, h or 49


def handle_side(handle):
    c = (handle or ' ')[0]
    return c if c in 'wxyz' else 'z'


def handle_point(node, handle):
    w, h = node_size(node)
    x, y = node['position']['x'], node['position']['y']
    side = handle_side(handle)
    if side == 'w':
        return x + w / 2, y
    if side == 'x':
        return x + w / 2, y + h
    if side == 'y':
        return x, y + h / 2
    return x + w, y + h / 2


def edge_path(from_pt, from_side, to_pt, to_side):
    mx = (from_pt[0] + to_pt[0]) / 2
    my = (from_pt[1] + to_pt[1]) / 2
    c1 = (from_pt[0], my) if from_side in 'wx' else (mx, from_pt[1])
    c2 = (to_pt[0], my) if to_side in 'wx' else (mx, to_pt[1])
    return [from_pt[0], from_pt[1], c1[0], c1[1], c2[0], c2[1], to_pt[0], to_pt[1]]


NUM = re.compile(r'-?\d+\.?\d*(?:e-?\d+)?')


def main():
    slug = sys.argv[1] if len(sys.argv) > 1 else 'frontend'
    fixture_path = os.path.join(ROOT, 'fixtures', f'official_rendered_{slug}.json')
    if not os.path.exists(fixture_path):
        fixture_path = FIXTURE
    fixture = json.load(open(fixture_path, encoding='utf-8'))
    roadmap = json.load(open(
        os.path.join(ROOT, 'data', 'roadmaps', f'{slug}.json'), encoding='utf-8'))

    nodes = {n['id']: n for n in roadmap['nodes']}
    ok, bad, skipped = 0, [], 0

    for edge in roadmap['edges']:
        official = fixture['edges'].get(edge['id'])
        if not official:
            skipped += 1
            continue
        a, b = nodes.get(edge['source']), nodes.get(edge['target'])
        if not a or not b:
            skipped += 1
            continue
        p1 = handle_point(a, edge.get('sourceHandle'))
        p2 = handle_point(b, edge.get('targetHandle'))
        expected = edge_path(
            p1, handle_side(edge.get('sourceHandle')),
            p2, handle_side(edge.get('targetHandle')))
        actual = [float(v) for v in NUM.findall(official['d'])]
        if len(actual) != 8:
            bad.append((edge['id'], float('inf'), expected, actual))
            continue
        diff = max(abs(x - y) for x, y in zip(expected, actual))
        if diff < TOL:
            ok += 1
        else:
            bad.append((edge['id'], diff, expected, actual))

    total = ok + len(bad)
    print(f'edges: {ok}/{total} exact'
          + (f' ({skipped} skipped: no fixture counterpart)' if skipped else ''))
    for eid, diff, exp, got in bad:
        print(f'  MISMATCH {eid}  maxdiff={diff:.3f}')
        print(f'    ours    {[round(v, 3) for v in exp]}')
        print(f'    official {[round(v, 3) for v in got]}')
    if not bad:
        print('ALL EDGES MATCH THE OFFICIAL RENDERER')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
