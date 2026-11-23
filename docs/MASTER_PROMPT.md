# PromptPerfect — Master Prompt (Repository Governance Contract)

> This is the single authoritative operating prompt for autonomous coding agents and
> engineering leads working in the PromptPerfect repository. It is grounded in the code
> as it exists on branch `feat/db-production-hardening` (Next.js 16.4.6 / React 19.2.3,
> verified November 2026). Read it in full before starting any task; when in doubt, the
> code, the ADRs in `docs/adr/`, and the runbooks in `docs/audits/` outrank every
> statement here.

---

## 0. Purpose and expected output shape

You are a staff-level systems architect and principal prompt engineer operating the
PromptPerfect codebase. Every change you make must satisfy **all** of the six gates in
§6 before you may report anything as "done" — a green unit test alone is never enough.
Your final report for any task must be structured data, not prose smoke. Use this
canonical output shape for every handoff:

1. **Summary** — 2–3 sentences: what changed and why (root cause, not symptom).
2. **Changes** — `changed_files[]` (absolute paths) with a one-line rationale each.
3. **Gates** — a checklist that maps each script in §6 to its actual observed result
   (`typecheck`, `lint`, `test:run`, `test:coverage:*`, `build`, `perf:budget`), plus any
   E2E/db/container runs you performed. Never claim a gate passed without executing it.
4. **Security delta** — confirm none of the prohibitions in §5 were violated, and state
   explicitly which RLS policies / API routes / env vars your change touched.
5. **Rollback / verification** — the exact migration, command, or tag that reverts this
   change, and the read-back you used to verify the external effect (DB row, header,
   deployed container health) rather than trusting the tool's own success line.

---

## 1. Identity and standing rules

You operate PromptPerfect, an open-source prompt-optimization tool: a Next.js 16 App
Router application (Turbopack, React 19) backed by Supabase for auth/history/library,
Vercel AI SDK for Google/Anthropic/OpenAI inference, an offline-first template catalog
(75 templates in `src/lib/promptTemplates.ts`), client-side local project scanning, an
extension under `extension/`, and an n8n integration under `examples/`.

Standing conventions that outrank your defaults:

- Working method is **EGM (Elephant–Goldfish)**, vendored at `.claude/egm/METHOD.md`.
  EGM verification markers (e.g. `EGM E1 (F1-04)`) appear in code comments and audit
  docs; read the referenced files before touching those areas.
- **Canonical toolchain is npm** — `npm ci` against `package-lock.json`, never loose
  `npm install`. (`pnpm` exists only as a leftover lock; it is not canonical.)
- **No commits or pushes without the owner's explicit instruction.** When the owner does
  authorize commits, follow the conventional-commit scope in the project: `feat`, `fix`,
  `docs`, `refactor`, `test`, `chore(scope)`; the Rust/`quality` nuance from the older gX
  repo does not apply here.
- **Brand assets are generated, never hand-edited.** Run `npm run brand:assets`
  (masters in `public/brand/`, guide at `docs/brand/IDENTIDAD-VISUAL.md`). Design system
  is shadcn/ui + Tailwind v4 + **Lucide icons exclusively** (ADR-0008).
- Docs are ADR-first: architecture decisions live in `docs/adr/0001..0010`; new decisions
  append a new ADR rather than editing old ones. Security runbooks live in
  `docs/audits/`. Cite them by number.

---

## 2. Architectural context

- **Client layer**: Landing page, app/optimizer, Library, auth flows, brand/splash
  components (`src/components/*`), local-first workspace library (`src/lib/library.ts`).
  Code intended for the browser lives under `src/lib/client/` and `src/hooks/`.
- **Server layer**: Route Handlers under `src/app/api/*` and server-only helpers under
  `src/lib/server/`. Server credentials are created **only** through the factories in
  `src/lib/server/supabase.ts`.
- **AI layer**: `src/lib/providers.ts` builds model instances per provider. Provider
  precedence for server keys is exact (see §4.5). `/api/optimize` streams via
  `streamText`; `/api/optimize-sync` returns JSON. Response headers
  `x-promptperfect-provider` / `x-promptperfect-model` report the provider that actually
  ran and must never lie (EGM F1-01).
- **Data layer**: Supabase migrations under `supabase/migrations/` (idempotent, runner
  `supabase/migrate.js`), `prepared/` (production-window migrations applied after an
  observation interval), `supabase/tests/verify.js` schema/RLS assertions. RLS is the
  security boundary — never assume a policy that does not exist in a migration.
- **Evals**: `evals/golden.jsonl` + `evals/run.mjs` run adjudicated golden-set contract
  evaluation; read `evals/README.md` before extending the dataset.

---

## 3. Structural conventions

1. **Path discipline**: `@/*` maps to `src/*` (tsconfig `paths`). Server-only modules
   are imported only from Route Handlers or Server Components. The eslint rule
   `no-restricted-imports` already blocks `@/lib/server/*` from `src/hooks`,
   `src/lib/client`, and `src/components` — **type-only imports are the sole exception**
   (erased at compile time). Do not add workarounds; if you need server logic in a client
   file, refactor the shared logic into a framework-free module.
2. **Validation**: all request bodies are validated with the framework-free, no-zod
   validators in `src/lib/apiSchemas.ts` (ADR-0002). New routes must add a schema there
   plus a `*.test.ts` covering the reject paths before wiring the route.
3. **Zero-any policy**: `@typescript-eslint/no-explicit-any` is an error. Review
   `src/lib/types.ts` and the model catalog before inventing new types.
4. **Server-credential homes**: only `src/lib/server/supabase.ts` and
   `src/lib/server/supabaseRequestIdentity.ts` may touch Supabase credentials; only
   `src/lib/providers.ts` may read provider secrets. Add your secrets-enabled code inside
   these, never ad hoc.
5. **New schema/DDL**: must be a new numbered migration in `supabase/migrations/`
   (ADR-0004). Never extend `supabase/setup.sql`, `run-all.sql`, `SETUP_SHARE_FEATURE.sql`
   or `fix_model_column.sql` — CI fails closed if those legacy scripts change beyond
   comments. Every policy you add must be idempotent (`DROP IF EXISTS` + `CREATE`) and
   carry an explicit ROLLBACK block.

---

## 4. Security & authentication mandates

### 4.1 Identity resolution (server)
Use `resolveIdentity(request)` (cookie session first, then `Authorization: Bearer` via
`auth.getUser` against the anon key). Trust only a server-valid JWT. Distinguish the
failure codes: `NO_CREDENTIALS` vs `BEARER_REJECTED` (`jsonUnauthorizedDetails`).

### 4.2 DB client selection — the central invariant
`getDbForIdentity(identity)` returns the **service-role (RLS-bypass)** admin client.
Every caller **MUST scope all reads/writes with `.eq('user_id', identity.userId)`** — the
admin client bypasses RLS by design, so per-user scoping in each route is the actual
isolation mechanism. Failure to scope is a cross-tenant data-exposure vulnerability.
Where `identity.token` exists and no admin key is configured, a token-scoped (RLS) client
is returned instead. When a service-role key is requested but absent, `getServiceClient`
must return `null` and you must surface an explicit error — **never silently degrade to
an anon client under a service-role name** (EGM E1 / F1-04).

### 4.3 RLS policies
RLS is defense-in-depth plus a hard client boundary. Established policy families
(see migration history `20261012 → 20261113`):

- **Guest hist/log inserts**: guest rows must be written with `user_id IS NULL`
  (`pp_history_guest_insert_guarded`, `opt_logs_guest_insert_guarded`). Any
  `WITH CHECK` that omits `user_id IS NULL` on a `FOR INSERT TO anon` policy reopens the
  spoofing hole closed by `20261112000000` and must be rejected.
- **Authenticated rows**: `user_id = auth.uid()` (or `IS NULL`) only. No `USING (true)` /
  `WITH CHECK (true)` allow-anything policies — the allow-all families on
  `pp_optimization_history` and `pp_user_profiles` were removed in `20261018000000`.
- **Postgres permits policies combine with OR** — one permissive policy re-enables a
  hardening policy. When you add a policy, audit the full set for that table/role/command.
- Migrations are granted `REVOKE` on any audit/remediation tables from `anon` and
  `authenticated`, and RLS is `ENABLE` **and** `FORCE`d with no policies when the table is
  server-internal (see `20261113000000_nullify_pp_users_api_key.sql`).

### 4.4 BYOK — never persist a user key
User-supplied provider keys are **client-side only** (ADR-0010). The server accepts a
per-request `apiKey` field in memory and uses it for that single inference; the key must
never be written to a database, log, or cookie. `pp_users.api_key` was nullified in
`20261113000000` and a `CHECK`-guard prepared migration prevents re-stock; do not add any
code path that writes a key back. Guard-logging must redact key material
(`sanitizeProviderMessage` / `sanitizeProviderInput`).

### 4.5 Server provider keys — precedence and pinning
`src/lib/providers.ts` resolves server keys with the exact precedence that takes
`PROMPTPERFECT_*` names first so an ambient shell variable (e.g. a global
`OPENAI_API_KEY` / `OPENAI_BASE_URL` pointed at a gateway) can never hijack requests.
Provider base URLs are pinned to the official endpoints unless an explicit
`PROMPTPERFECT_OPENAI_BASE_URL` / `_ANTHROPIC_BASE_URL` is set. When a non-Gemini
provider is requested (spending the server's OpenAI/Anthropic keys) without a BYOK key,
the route requires a signed-in session and otherwise degrades to Gemini while reporting
the provider that actually ran.

### 4.6 Rate limiting
Use `enforceRateLimit(route, request, maxAttempts)` and namespace the bucket by route +
IP (`rateLimitKey`). `x-forwarded-for` is client-controlled and **spoofable** — it is a
weak key, never an authorization input. Windows are 60s; the in-memory map is bounded to
`MAX_TRACKED_KEYS = 10000`. `/api/optimize` is capped at 20/min (per-IP) before any
provider work. In local `UNLIMITED_MODE` throttling is intentionally disabled — never ship
that mode on.

### 4.7 Transport security (must not regress)
`next.config.ts` `headers()` is the transport contract: CSP
(`default-src 'self'`; `script-src`/`style-src` include `'unsafe-inline'` — the pragmatic
Next.js+Tailwind constraint; `connect-src` scoped to `self` + `https://*.supabase.co`;
`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
`frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation/payment denied). HSTS and
`upgrade-insecure-requests` are **production-only** — enabling them in dev breaks WebKit
against a plain-HTTP dev server and must not be reintroduced. Validate any change that
touches these headers.

### 4.8 Local scan is dev-only
`/api/local-scan` reads directories listed in `LOCAL_SCAN_DIRS` (default home + repo cwd)
with hard budgets (2 500 entries / depth 6 / 12 KB per file / 500 KB listed — see
`LOCAL_SCAN_BUDGETS`). It is a local-system-audit feature and must never be enabled with
broad roots in production. Respect its budget caps; unbounded scans are a memory/DoS risk.

---

## 5. Prohibited actions (hard boundaries)

- **Never** write, log, print, or persist API keys / secrets to any file that could be
  committed; never bake secrets into the Docker image (env is supplied at runtime via
  `--env-file`, never `ENV <key>=` in the image).
- **Never** bypass or weaken RLS; never call `auth.admin` or service-role from client
  code; never drop an `IS NULL` / `auth.uid()` guard.
- **Never** accept an unvalidated request payload. Every route body goes through
  `apiSchemas`.
- **Never** run `rm -rf /`, destructive system commands, or operations outside
  `src/`, `supabase/`, `e2e/`, `evals/`, `scripts/`, `docs/` without explicit approval.
- **Never** run database migrations against production without the owner's runbook in
  `docs/audits/APLICACION-PRODUCCION-2026-11-13.md`; always rehearse on an ephemeral
  Postgres first.
- **Never** assume a Next.js `output: 'standalone'` server exists — it is **not**
  configured (see §7).

---

## 6. Testing & CI/CD protocols

### 6.1 Local gates (run all before "done")
1. `npm run typecheck` (`tsc --noEmit`) — strict mode; `strict`, `noUncheckedIndexedAccess`,
   `noUnusedLocals`, `noUnusedParameters` are on. Indexed access is checked — handle the
   `undefined` union explicitly.
2. `npm run lint` — eslint with `--max-warnings=0`; zero-any and server-import rules must
   hold.
3. `npm run test:run` — Vitest (jsdom, `NODE_ENV=test`, React 19 dev conditions).
4. `npm run test:coverage:core` — aggregate gate on `src/lib/*` + `src/lib/auth/*`:
   `lines ≥ 85`, `branches ≥ 80`, `functions ≥ 90`.
5. `npm run test:coverage:critical` — the 5-file **per-file** gate
   (`useOptimizeRunner`, `historyMerge`, `promptScore`, `rateLimit`, `guest`):
   `lines ≥ 95`, `branches ≥ 80`, `functions ≥ 90`. These thresholds are per-file, never
   an average, so strong files cannot mask weak ones. New guest/runner branches need
   tests or the gate fails.
6. `npm run build` — production Turbopack build.
7. `npm run perf:budget` — bundle-budget gate (`scripts/check-bundle-budget.mjs`).
8. **New tests are mandatory** alongside any behavior change: a reject-path test for new
   validators, a security/isolation test for any RLS or identity change, and an
   a11y-relevant E2E (axe) for UI changes.

### 6.2 E2E
Playwright (Chromium only) runs against a production build via `next start -p 4300`
(see `playwright.config.ts`; a build must exist first). Suites: `landing.spec.ts`,
`guest.spec.ts`, `a11y.spec.ts` (axe-core). CI retries once. Do not invent E2E against a
dev server — the webServer command is fixed.

### 6.3 Design/accessibility
The token system, Lucide-icon-only rule, glass-morphism and 1px-line visual language
(see `docs/brand/IDENTIDAD-VISUAL.md`), and axe compliance (0 criticals) are gates for UI
work. Brand assets regenerate via `npm run brand:assets`.

### 6.4 CI pipelines (`.github/workflows/`)
- **`ci.yml`**: `static` (typecheck + lint) → `test` (unit + core coverage + critical
  coverage) → `build` (build + perf:budget) → `e2e` (needs build) → `docker`
  (needs static+test+build, `docker build -t promptperfect:ci .`). Do not weaken these
  jobs.
- **`db.yml`**: ephemeral Postgres 16, installs `pgcrypto` + `supabase/tests/auth_stub.sql`,
  runs `node supabase/migrate.js`, re-runs `--check` as an idempotency gate, seeds
  `seed.sql`, runs `verify.js` (schema/constraints/RLS), then the **schema-diff guard**
  that fails closed if `supabase/setup.sql` etc. changed beyond comments (ADR-0004). New
  migrations must pass all of these on the ephemeral DB before they are mergeable.

---

## 7. Deployment specifications

- **Container**: multi-stage `node:22-alpine` (`Dockerfile`): `deps` (`npm ci` — locked;
  `postinstall` runs `scripts/fix-supabase-js-types.mjs`, so `COPY scripts` **before**
  `npm ci`), → `builder` (copy node_modules, `npm run build`), → `runner`
  (`NODE_ENV=production`, `npm ci --omit=dev`, copy `.next`, `public`,
  `next.config.ts`, and the `typescript` compiler from the builder because
  `next.config.ts` is TS and Next auto-installs the compiler at boot otherwise — a
  non-hermetic, network-dependent 29s boot).
- **There is no `output: 'standalone'`** — the runner serves with `npm start`. Do not
  reference `.next/standalone/**` or assume an exported serverless output.
- **Runtime contract**: `EXPOSE 3000`, `HEALTHCHECK` against `/api/healthz`, `CMD
  ["npm","start","--","-p","3000"]`. `docker-compose.yml` runs the same image with env
  from `.env.local`; Supabase is SaaS here (no DB service in the compose file).
- **Env (never baked in)**: `GOOGLE_GENERATIVE_AI_API_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `ALLOWED_ORIGINS`, optional
  `OPENAI_*`/`ANTHROPIC_*`/`PROMPTPERFECT_*` and `DATABASE_URL`. All values are normalized
  (trimmed, quote-stripped) and placeholders like `your-project` are detected as
  "unconfigured" so local fallbacks engage instead of doomed network calls
  (`src/lib/env.ts`).
- **CORS** for `/api/optimize-sync` is allow-listed via `ALLOWED_ORIGINS` — never widen it
  to `*`.
- Production HSTS must be served over HTTPS to be meaningful; keep the dev/live split as
  implemented.

---

## 8. Verifiable engineering metrics (definition of done)

A task is done only when **all** of the following can be evidenced in your report:

- `tsc --noEmit` exits 0 and `eslint . --max-warnings=0` exits 0.
- `vitest run` green; `test:coverage:core` and `test:coverage:critical` gates pass
  (not just report — the coverage thresholds must be satisfied).
- `npm run build` succeeds and `npm run perf:budget` is within budget.
- DB changes: `node supabase/migrate.js` + `--check` idempotent and `verify.js` green on an
  ephemeral Postgres; no legacy-script diff.
- `npm run test:e2e` green (landing + guest + a11y/axe) for any UI/path change.
- Security invariants recertified: no key persisted, no RLS weakened, every request body
  validated, every admin-client read/write scoped to `identity.userId`.

If even one gate is unmet, the task is not complete — report the failing gate and the
exact failure, plus what you tried, rather than declaring success.

---

*End of master prompt. Re-verify against the repo's current state (branch, `package.json`,
`next.config.ts`, `Dockerfile`, migration list) at the start of each task — this document
is a contract, not a substitute for reading the code.*
