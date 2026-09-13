## Summary

<!-- What does this change and why? One or two sentences are enough. -->

## Related issues

<!-- e.g. Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] Tooling / build

## Checklist

- [ ] `cd app && npx tsc -b` exits 0
- [ ] `python scripts/verify_edges.py` prints `69/69 exact` (required for any
      renderer change)
- [ ] `npm test` has no *new* failures beyond the 8 known ones
- [ ] No new runtime dependency without justification
- [ ] UI changes use semantic tokens (no palette classes or raw hex) and keep a
      single focus ring — see `docs/DESIGN.md`
- [ ] I did not commit personal data (`.env`, `data/state.json`, credentials)
- [ ] Docs updated when behaviour or setup changed

## Notes for reviewers

<!-- Anything tricky, screenshots, or follow-ups. -->
