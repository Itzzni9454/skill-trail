# Contributing

Thanks for helping improve Skill Trail. This is a single-user, offline tool,
so the bar for changes is: **it must keep working offline, and it must not move
the rendering away from the official roadmap.sh geometry.**

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for prerequisites and commands.
The short version:

```bash
npm run setup        # install server/ and app/ dependencies
npm run app:build    # typecheck + build the frontend
npm start            # http://localhost:4177
```

## Before you open a pull request

Run the checks that matter and make sure they pass:

```bash
cd app && npx tsc -b            # typecheck — must exit 0
python scripts/verify_edges.py  # fidelity guard — must print "69/69 exact"
npm test                        # suite
```

`scripts/verify_edges.py` is non-negotiable for anything touching the renderer:
if it does not report `69/69 exact`, the change is wrong or the fixture needs a
documented reason to change (see [docs/FIDELITY.md](docs/FIDELITY.md)).

`npm test` must pass — the suite (63 tests) is green and CI enforces it on
every PR. Don't mask a failure by weakening an assertion; if a test is wrong,
explain why in the PR.

## What makes a good change

- **Keep the dependency count low.** The server's only runtime dependency is
  `express`. Adding a package needs a real justification.
- **Use semantic tokens, never palette classes or raw hex**, in the app chrome —
  see [docs/DESIGN.md](docs/DESIGN.md). The two sanctioned exceptions are the
  official canvas colours and the RPG skill-tree palette.
- **Keep Balsamiq Sans on the canvas only.** It is the fidelity contract.
- **Comment *why*, not *what*.** Odd constants should cite the probe or script
  that derived them.
- **Watch hook ordering.** A hook placed after an `if (!data) return <Loading/>`
  early return crashes with React error #310.
- **Write cross-platform code.** The project is developed on Windows and must run
  on macOS and Linux too — use `node:path`, not string concatenation.

## Commit messages

Write a concise subject in the imperative mood and explain the *why* in the body
when it is not obvious. Keep each commit focused on one logical change.

## Reporting bugs and requesting features

Use the issue templates under [.github/ISSUE_TEMPLATE](.github/ISSUE_TEMPLATE).
For security issues, **do not** open a public issue — follow
[SECURITY.md](SECURITY.md).

## Scope note: roadmap content

Roadmap JSON and topic content come from upstream roadmap.sh. Content fixes
belong in the upstream `kamranahmedse/developer-roadmap` project, not here — this
repository only reads that content. See [docs/CONTENT.md](docs/CONTENT.md).
