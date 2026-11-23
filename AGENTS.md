# PromptPerfect — Agent charter

This repository's working method is **EGM** (Elephant–Goldfish), vendored
natively in `.claude/egm/` — read `.claude/egm/METHOD.md` first. Skills live
in `.claude/skills/egm-*/`, agent personas in `.claude/egm/agents/` with
invocable wrappers in `.claude/agents/`.

The **operating master prompt** for agents/leads working in this repo lives at
`docs/MASTER_PROMPT.md` — it defines the canonical output shape, all engineering
gates, the security/RLS mandates and the deployment contract. Read it before
starting any task; its "definition of done" (§8) outranks a single green test.

Project rules that outrank defaults:

- Canonical toolchain is **npm** (`npm ci` against `package-lock.json`).
- Gates before claiming done: `npm run typecheck`, `npm run lint`
  (`--max-warnings=0`), `npm run test:run`, `npm run build`,
  `npm run perf:budget`. Database changes: rehearse on an ephemeral
  Postgres (`npm run db:migrate` / `db:verify`) — never against production
  without the owner's runbook in `docs/audits/APLICACION-PRODUCCION-2026-11-13.md`.
- Brand assets are generated, never hand-edited: `npm run brand:assets`
  (masters in `public/brand/`, guide in `docs/brand/IDENTIDAD-VISUAL.md`).
- No commits or pushes without the owner's explicit instruction.
