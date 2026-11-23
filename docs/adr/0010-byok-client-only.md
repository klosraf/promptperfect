# ADR-0010: BYOK keys are client-only; the server never persists them

- Status: Accepted (design EGM APTO CON CAMBIOS APLICADOS, 2026-11-13).
  Implementation state at acceptance: code implemented and gated locally;
  the data migrations are PREPARED AND EPHEMERAL-TESTED ONLY — not executed
  against the real database (see the remediation report's runbook).
  see `docs/audits/egm-byok-2026-11-13/` and
  `docs/audits/REMEDIACION-BYOK-2026-11-13.md`)
- Supersedes: the server-persistence behaviour noted in audit F2-08/F3-01.

## Context

`pp_users.api_key` stored the user's OpenAI/Anthropic key in plaintext on the
server, while the README promises: "Your API keys are stored locally in your
browser and never saved to our servers." A verified flow map (2026-11-13)
showed the persisted copy has **no consumer**: no route reads the column, no
optimization path uses it, and the workspace session reads the key only from
`localStorage` (`loadApiKey`). The only non-empty writer was
`POST /api/auth/update-user`; the only senders were the two settings clients,
which already keep a local copy.

## Decision

User API keys live only in the user's browser (`localStorage`, per provider)
and reach providers per request (`Authorization: Bearer` or request body).
The server never writes a key anywhere:

- `parseUpdateUserBody` still validates an `api_key` field from
  already-deployed clients (identical 400 contract) and discards it.
- `update-user`, signup, login and save-history writes never include
  `api_key`.
- The plaintext stock is nullified by migration
  `20261113000000_nullify_pp_users_api_key.sql` (in `supabase/migrations/`),
  and the prepared file `supabase/prepared/20261113000001_pp_users_api_key_guard.sql`
  adds a CHECK guard (`api_key IS NULL OR api_key = ''`) after an
  observation window. It lives outside `supabase/migrations/` on purpose and
  mechanically refuses to run while the step-1 seat is under 14 days old;
  on execution day it is moved into `supabase/migrations/` and applied.
- The column is dropped only in a later, separate sovereign step.

## Threat model (accepted residuals)

- A database dump exposes no user keys (post-migration live table).
- Historical backups taken before nullification may still contain keys;
  nullification cannot fix them. The only remedy is user rotation at the
  provider; the execution runbook requires notifying affected users
  (identified by id/email only, never by key) with a 30-day rotation window.
- `localStorage` custody is readable by any XSS in the app origin. This risk
  pre-exists, becomes the single custody under this ADR, and is **accepted
  explicitly**: mitigations are the app's CSP and the fact that logout wipes
  stored keys (`clearStoredApiKeys`). Closing the browser does not wipe them;
  signing out does.

## Invariants for future changes

- Non-empty stock is always counted as
  `api_key IS NOT NULL AND api_key <> ''` (both sentinels exist: `NULL` for
  nullified rows, `''` as the column default).
- No new server write path may include `api_key`; no log may include a key
  value or an `Authorization` header.
- The parser compatibility shim (accept-and-discard) is removed in the
  release after the guard migration ships and both in-repo clients have
  completed a release that does not send the field.
- Gemini is out of scope by inexistence: it uses the product's server key;
  no per-user Gemini key is ever stored.
