# Documentation

This folder is the reference for the Skill Trail project. The root
[`README.md`](../README.md) is the front door; everything deeper lives here.

| Document | What it covers |
|---|---|
| [GETTING-STARTED.md](./GETTING-STARTED.md) | New here? The ten-minute walkthrough: install, first topic, troubleshooting. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the three layers (frontend, API, data) fit together, the request path, background jobs, and the state model. |
| [API.md](./API.md) | Every HTTP endpoint the local server exposes, grouped by feature. |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Prerequisites, setup, dev/build/test commands, environment variables, and code conventions. |
| [FIDELITY.md](./FIDELITY.md) | The renderer-fidelity contract (why output matches roadmap.sh bit-for-bit) and how it is verified. |
| [CONTENT.md](./CONTENT.md) | Where roadmap JSON and topic markdown come from, the bootstrap and weekly updater, and licensing/attribution. |
| [DESIGN.md](./DESIGN.md) | The UI design system: semantic tokens, themes, typography, accessibility and motion rules. |
| [AUDIT.md](./AUDIT.md) | A point-in-time codebase audit: what was verified, what was fixed, what is still open. |
| [REDESIGN.md](./REDESIGN.md) | The UI redesign log (three rounds) with verification results and known follow-ups. |

Design context for the interface also lives in [`../.impeccable.md`](../.impeccable.md)
at the repository root.

> **Snapshot docs.** `AUDIT.md` and `REDESIGN.md` are dated records, not living
> specifications. They describe the state of the code on the dates at the top of
> each file. If they disagree with the source, the source wins.
