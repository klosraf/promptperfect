# ADR 0009 — Local system-audit scanning (dev-only, defense in depth)

- Status: accepted
- Date: 2026-10-16

## Context

The Production Audit flow needed server-side analysis of developer
machines (`/Users/klosraf`): the browser File System Access API cannot
open absolute paths and chokes on huge home trees. A server scan
exposes filesystem listings by design, so it must be impossible to
reach in production and tightly bounded in dev.

## Decision

- `POST /api/local-scan` (`src/app/api/local-scan/route.ts`, `src/lib/server/localScan.ts`):
  - 404 unless `NEXT_PUBLIC_UNLIMITED_MODE`/`UNLIMITED_MODE` (ADR-0003).
  - `parseLocalScanBody` (`src/lib/apiSchemas.ts`, ADR-0002): bounded
    `dir` (1024 chars), `audit` allow-listed literal (`'system'` only —
    unknown modes are dropped, never widen the scan).
  - `path.resolve` + `isPathAllowed` against `LOCAL_SCAN_DIRS`
    (default: home + repo cwd). Symlinks never followed; depth 6,
    2500 entries, 12 KB/file caps.
  - `enforceRateLimit('local-scan', 10/min)` + `logApi` timing
    (unlimited mode bypasses throttling per ADR-0003).
  - `audit=system` restricts to config surfaces (dotfiles, `bin/`,
    `.config/`, LaunchAgents/Preferences/Daemons, selective AI-agent
    configs, env pins, live brew/mise/driver inventory). Data dirs,
    project checkouts, caches, and secret stores
    (`.ssh/.gnupg/.aws/.kube/…`) are excluded; AI configs pass
    through `redactSecrets` (structure kept, secret-adjacent values
    masked). `LOCAL_SCAN_NO_EXEC=1` disables subprocesses in tests.
- UI (`src/components/ProjectLinker.tsx`): "Scan a local-disk path"
  + "Audit system" buttons; input prefilled with the dev home.

## Consequences

- Never enable unlimited mode in production: the route becomes a
  filesystem oracle. `getLocalScanRoots` defaults are dev-machine
  shaped; override via `LOCAL_SCAN_DIRS` in other environments.
- New scan surfaces must extend `parseLocalScanBody` + tests, never
  inline checks; new secret-adjacent keys go in `SECRET_KEY_RE`.
