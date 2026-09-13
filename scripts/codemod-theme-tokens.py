#!/usr/bin/env python
"""Codemod: hard-coded Tailwind palette classes -> semantic theme tokens.

The components were written against fixed Tailwind colours (`text-slate-400`,
`bg-emerald-500`, `border-slate-700` …). Those ignore `data-theme`, so every
theme rendered as "the same UI with a different background tint" and dark
variants only worked for the three themes that toggled `.dark`.

This rewrites them to the semantic utilities bridged in `app/src/index.css`
(`text-ink-muted`, `bg-done`, `border-line`, …) which resolve through
`--theme-*` and therefore follow whatever theme is active.

It also drops now-redundant `dark:` colour variants: once a colour is semantic,
`text-ink-muted` is already correct in both light and dark, so the paired
`dark:text-slate-300` is noise.

Usage:
  python scripts/codemod-theme-tokens.py            # dry run, prints a report
  python scripts/codemod-theme-tokens.py --write    # apply
"""
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'app', 'src')

# --- hue -> semantic role -------------------------------------------------
ROLE = {
    'emerald': 'done', 'green': 'done',
    'blue': 'learning', 'sky': 'learning',
    'amber': 'due', 'yellow': 'due', 'orange': 'due',
    'red': 'danger', 'rose': 'danger',
    'purple': 'note', 'violet': 'note',
    'indigo': 'accent', 'teal': 'accent', 'cyan': 'accent',
}

# --- per-property overrides (shade aware) --------------------------------
NEUTRAL = {
    'text': {
        50: 'ink-faint', 100: 'ink-faint', 200: 'ink-faint', 300: 'ink-faint',
        400: 'ink-faint', 500: 'ink-muted', 600: 'ink-muted', 700: 'ink-muted',
        800: 'ink', 900: 'ink', 950: 'ink',
    },
    'bg': {
        50: 'raised', 100: 'raised', 200: 'active', 300: 'active',
        400: 'active', 500: 'active', 600: 'raised', 700: 'raised',
        800: 'raised', 900: 'raised', 950: 'raised',
    },
    'border': {
        50: 'line', 100: 'line', 200: 'line', 300: 'line',
        400: 'line-strong', 500: 'line-strong', 600: 'line',
        700: 'line', 800: 'line', 900: 'line', 950: 'line',
    },
    'ring': {
        50: 'line', 100: 'line', 200: 'line', 300: 'line',
        400: 'line-strong', 500: 'line-strong', 600: 'line',
        700: 'line', 800: 'line', 900: 'line', 950: 'line',
    },
    'divide': {
        50: 'line', 100: 'line', 200: 'line', 300: 'line',
        400: 'line-strong', 500: 'line-strong', 600: 'line',
        700: 'line', 800: 'line', 900: 'line', 950: 'line',
    },
    'from': {
        50: 'raised', 100: 'raised', 200: 'active', 300: 'active',
        400: 'active', 500: 'active', 600: 'raised', 700: 'raised',
        800: 'raised', 900: 'raised', 950: 'raised',
    },
    'to': {
        50: 'raised', 100: 'raised', 200: 'active', 300: 'active',
        400: 'active', 500: 'active', 600: 'raised', 700: 'raised',
        800: 'raised', 900: 'raised', 950: 'raised',
    },
    'via': {
        50: 'raised', 100: 'raised', 200: 'active', 300: 'active',
        400: 'active', 500: 'active', 600: 'raised', 700: 'raised',
        800: 'raised', 900: 'raised', 950: 'raised',
    },
}

# --- opaque white/black, only when there is no alpha modifier ------------
# `bg-black/40` is a modal scrim and must stay a real black; `border-white/10`
# is a decorative glass edge. Only the solid cases are safe to re-point.
SPECIAL = {
    'bg-white': 'bg-surface',
    'divide-white': 'divide-line',
    'border-white': 'border-line',
}

PROPS = ('text', 'bg', 'border', 'ring', 'from', 'to', 'via', 'divide', 'outline', 'fill', 'stroke')

CLASS_RE = re.compile(
    r'^(?P<pre>(?:[a-z0-9-]+:)*)'
    r'(?P<util>' + '|'.join(PROPS) + r')-'
    r'(?P<hue>slate|gray|zinc|neutral|stone|'
    r'emerald|green|blue|sky|cyan|teal|amber|yellow|orange|red|rose|purple|violet|indigo)-'
    r'(?P<shade>\d{2,3})'
    r'(?P<op>/[\d.]+)?$'
)

NEUTRAL_HUES = {'slate', 'gray', 'zinc', 'neutral', 'stone'}


def convert_class(token: str):
    """Return the semantic replacement for one utility token, or None."""
    if token in SPECIAL:
        return SPECIAL[token]
    m = CLASS_RE.match(token)
    if not m:
        return None
    util, hue, shade, op = m.group('util'), m.group('hue'), int(m.group('shade')), m.group('op')

    if hue in NEUTRAL_HUES:
        table = NEUTRAL.get(util)
        if not table:
            return None
        role = table.get(shade)
        if not role:
            return None
        return f'{util}-{role}' + (op or '')

    role = ROLE.get(hue)
    if not role:
        return None
    # A translucent tint reads as the "-soft" surface token.
    if util in ('bg', 'from', 'to', 'via') and op:
        return f'{util}-{role}-soft'
    return f'{util}-{role}' + (op or '')


def split_variants(token: str):
    parts = token.split(':')
    return parts[:-1], parts[-1]


SEMANTIC_RE = re.compile(
    r'^(?P<util>' + '|'.join(PROPS) + r')-'
    r'(?P<role>ink|ink-muted|ink-faint|page|surface|raised|hover|active|'
    r'line|line-strong|accent|accent-soft|accent-ink|'
    r'done|done-soft|learning|learning-soft|skipped|skipped-soft|'
    r'due|due-soft|danger|danger-soft|note|note-soft)'
    r'(?P<op>/[\d.]+)?$'
)


def colour_key(token: str):
    """(variants-without-dark, property) for any colour utility — semantic or
    still hard-coded. Used to spot a `dark:` colour variant that is now
    redundant because its non-dark counterpart is already theme-aware."""
    variants, base = split_variants(token)
    prop = base.split('-', 1)[0] if '-' in base else base
    if prop not in PROPS:
        return None
    if convert_class(base) is None and not SEMANTIC_RE.match(base):
        return None
    return (tuple(v for v in variants if v != 'dark'), prop)


def process_class_list(value: str, stats: Counter, drop_stats: Counter) -> str:
    """Rewrite one class list (no surrounding quotes present)."""
    tokens = value.split()

    base_keys = set()
    for tok in tokens:
        variants, _base = split_variants(tok)
        if 'dark' in variants:
            continue
        k = colour_key(tok)
        if k:
            base_keys.add(k)

    out = []
    for tok in tokens:
        variants, base = split_variants(tok)
        mapped = convert_class(base)

        if 'dark' in variants:
            k = colour_key(tok)
            if k and k in base_keys:
                drop_stats['dark_dropped'] += 1
                continue
            if mapped is not None:
                stats['converted'] += 1
                out.append(''.join(v + ':' for v in variants) + mapped)
                continue
            out.append(tok)
            continue

        if mapped is None:
            out.append(tok)
            continue
        stats['converted'] += 1
        out.append(''.join(v + ':' for v in variants) + mapped)

    return ' '.join(out)


# className="..."  |  className={`...`}  |  className={expr ? '...' : '...'}
# The expression branch handles one level of nesting, which covers ternaries and
# logical operators — the shapes the components actually use.
ATTR_RE = re.compile(
    r'(className\s*=\s*)(?:'
    r'"(?P<dq>[^"]*)"'
    r'|\{\s*`(?P<tpl>[^`]*)`\s*\}'
    r'|\{(?P<expr>(?:[^{}]|\{[^{}]*\})*)\}'
    r')'
)
# A quoted string literal inside a template expression.
LITERAL_RE = re.compile(r"(['\"])((?:(?!\1).)*)\1")


def transform_file(path: str, stats: Counter, drop_stats: Counter) -> str | None:
    with open(path, encoding='utf-8') as fh:
        src = fh.read()

    def sub_literal(lm: re.Match) -> str:
        quote, inner = lm.group(1), lm.group(2)
        new = process_class_list(inner, stats, drop_stats)
        if new == inner:
            return lm.group(0)
        stats['attrs_changed'] += 1
        return f'{quote}{new}{quote}'

    def repl(m: re.Match) -> str:
        head = m.group(1)

        if m.group('dq') is not None:
            val = m.group('dq')
            new = process_class_list(val, stats, drop_stats)
            if new == val:
                return m.group(0)
            stats['attrs_changed'] += 1
            return f'{head}"{new}"'

        if m.group('tpl') is not None:
            tpl = m.group('tpl')
            new_tpl = LITERAL_RE.sub(sub_literal, tpl)
            if new_tpl == tpl:
                return m.group(0)
            return f'{head}{{`{new_tpl}`}}'

        expr = m.group('expr')
        new_expr = LITERAL_RE.sub(sub_literal, expr)
        if new_expr == expr:
            return m.group(0)
        return f'{head}{{{new_expr}}}'

    new_src = ATTR_RE.sub(repl, src)
    if new_src == src:
        return None
    return new_src


def main():
    write = '--write' in sys.argv
    stats, drop_stats = Counter(), Counter()
    changed_files = []

    for dirpath, _dirs, files in os.walk(SRC):
        for name in files:
            if not name.endswith(('.tsx', '.ts')):
                continue
            path = os.path.join(dirpath, name)
            new = transform_file(path, stats, drop_stats)
            if new is None:
                continue
            changed_files.append(os.path.relpath(path, ROOT))
            if write:
                with open(path, 'w', encoding='utf-8') as fh:
                    fh.write(new)

    mode = 'APPLIED' if write else 'DRY RUN'
    print(f'--- {mode} ---')
    print(f'files changed:        {len(changed_files)}')
    print(f'attributes rewritten: {stats["attrs_changed"]}')
    print(f'classes converted:    {stats["converted"]}')
    print(f'redundant dark: dropped: {drop_stats["dark_dropped"]}')
    print()
    for f in sorted(changed_files):
        print('  ', f)
    if not write:
        print('\nRe-run with --write to apply.')


if __name__ == '__main__':
    main()
