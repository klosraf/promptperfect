# ADR 0006 — Guest-usage tracking and account migration

- Status: accepted
- Date: 2026-10-12

## Context

Anonymous visitors get 5 free optimizations, keyed by a client-generated fingerprint
(`nanoid`, localStorage) — no login wall. Two historical `guest_usage` shapes exist
(text-PK from 20250404, uuid-PK + unique `guest_id` from 20260401); both must keep
working against the same RLS + constraint set.

## Decision

- Canonical grain: **one row per `guest_id` fingerprint** with `optimization_count`,
  `last_used_at/mode/provider`. The hardening migration converges both shapes
  (ensures `id`, unique non-empty `guest_id`, `optimization_count >= 0`) without
  rewriting either PK (no table rewrite, no downtime).
- **Write path**: only the service role via `/api/guest-usage` (RLS denies anon/
  authenticated). The client never writes usage directly, so counts can't be forged
  or decremented from the browser.
- **Claim path**: on signup, guest history rows (`pp_optimization_history` with NULL
  `user_id`) are linked to the new account (`claim-guest-history` / `guest-migrate`
  routes); the profile trigger seeds `pp_user_profiles` (incl. backfilled
  `optimization_count`, `favorite_mode`).
- Quota constant lives in product code (`GUEST_TOKEN_LIMIT = 5`); the DB enforces
  shape/non-negativity, the API enforces the limit.

## Consequences

- Fingerprint rotation (cleared localStorage) resets quota — accepted trade-off for
  a frictionless trial; abuse backstop is server rate-limiting, not DB identity.
- Any future quota change is a code + (if structural) additive-migration change;
  historical rows remain valid.


## Addendum EGM 2026-11-12 — correcciones al registro

Este ADR describía una realidad que el código no cumplía; queda
corregido aquí sin reescribir la decisión original:

- **Forma real de `guest_usage`**: la tabla vigente es la de
  `20250404000000` (`guest_id text PRIMARY KEY`, sin columna `id`).
  La migración `20260401000000` (forma uuid-PK) fue **no-op** sobre
  bases que ya tenían la tabla (`CREATE TABLE IF NOT EXISTS`); solo
  aportó la política `service_role_only` y un índice. Afirmar lo
  contrario era falso (F5-06). La convergencia de esquema queda
  **pendiente de decisión**.
- **No existe ruta `guest-migrate`** ni backfill alguno: la única vía
  de claim es `/api/auth/claim-guest-history` (F5-10).
- **Claim honesto**: sin cliente admin la ruta responde 503 (antes
  devolvía `{ok:true, skipped:true}` con 200 y el cliente borraba el
  guest id: la migración se perdía en silencio). El cliente solo
  limpia el guest id tras un claim confirmado, y desapareció su vía
  directa anon de UPDATE sobre `pp_optimization_history`, que saltaba
  la guarda de filas no reclamadas (F5-11).
- **Cuota atómica**: el incremento es un RPC transaccional
  (`increment_guest_usage`, migración `20261112000001`, EXECUTE solo
  para service_role); la ruta usa la vía legada read-then-upsert solo
  si el RPC no existe en la base (F5-09). La cuota sigue siendo
  fricción comercial, no identidad: rotar el guest id la reinicia
  (consecuencia ya aceptada arriba).
