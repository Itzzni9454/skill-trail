# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Instead, report it
privately using GitHub's [Report a vulnerability](/security/advisories/new) form
(Security → Advisories → Report a vulnerability), or email the maintainer at
**[INSERT CONTACT METHOD]**.

Include a description, reproduction steps, and the impact you believe it has.
You can expect an acknowledgement within a few days.

## Threat model

Skill Trail is a **single-user local tool**, not a hosted service or a
multi-tenant application. The design assumes the machine and the network it runs
on are trusted. Concretely:

- **No authentication.** Every endpoint is open.
- **Binds all interfaces.** `app.listen(PORT)` has no host argument, so the API
  is reachable from the LAN. Only run it on a trusted network, or bind
  `127.0.0.1` if you share your machine.
- **Filesystem-backed.** Slugs and node ids from the URL are validated before
  being joined onto paths (`isSafeSlug` / `isSafeNodeId` in `server/src/store.js`)
  because Express decodes `%2F` in route params.
- **Secrets on disk.** Connector credentials live in `data/connectors.json` and
  Google service-account keys in `data/google-service-account.json`; both are
  gitignored. Treat them like any other credential file.

Reports about the *absence* of authentication or about LAN exposure are expected
by design and will be treated as known limitations rather than vulnerabilities.
Path traversal, arbitrary file read/write, injection, and credential leakage are
in scope.

## Before publishing a fork

If you publish this repository, check these first — they contain personal data or
machine-specific values:

- [ ] **`.env` is not committed.** It is gitignored; verify it isn't staged.
- [ ] **`data/state.json` is not committed.** It holds your learning history.
      It is gitignored — confirm it stays that way.
- [ ] **`data/connectors.json`, `data/dailys.json`, `data/leetcode.json`** are
      gitignored.
- [ ] **`server/data/google-service-account.json`** (a real key) is gitignored.
- [ ] **Hardcoded personal values are removed.** `server/src/gcalendar.js`
      currently falls back to a personal calendar id; change or remove that
      default before publishing.
- [ ] **Nested repositories are handled deliberately.** `developer-roadmap/` and
      `tools/ui-ux-pro-max/` each contain their own `.git`. Git records them as
      embedded repositories (gitlinks), so their contents are not published. If
      you intend to ship their contents, remove the inner `.git` and adjust
      licensing; if not, add them to `.gitignore`.
- [ ] **`archive/` and `scratch/`** (large local leftovers) are gitignored.

See [docs/CONTENT.md](docs/CONTENT.md) for the content-repository licensing note.
