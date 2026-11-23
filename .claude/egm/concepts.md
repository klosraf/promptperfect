# EGM Production-Readiness Master Prompt

* **Author:** klosraf
* **Date:** 2026-11-09

## Overview

The goal is a master prompt that tells an LLM agent or a human maintainer how to bring the Elephant-Goldfish Model (EGM) repository to a clean, production-ready state. The repository already contains most of the machinery this prompt would ask for: a Makefile, ruff and pytest configuration, seven GitHub Actions workflows, a runtime packaging script, a release script, a drift-report skill, and seventeen design documents. The work is therefore not to build eight new systems. It is to close a short, measured list of gaps, make the existing machinery reachable from one command, and make sure no change breaks the four supported harnesses (Claude Code, Copilot, Codex, Antigravity).

The prompt's consumer is both an LLM agent and a human maintainer. The agent needs exact file paths, commands, and validation checks. The human needs the same information in a form that can be reviewed and handed to `/egm-draft`.

## Analysis

### The central problem: the plan is broader than the gap

Six of the seven reviewers converged on the same finding: the eight-domain specification re-describes capabilities the repository already has. The Makefile already exposes `install`, `test`, `lint`, `format`, `package`, and `clean` (`Makefile:14-39`). Ruff and pytest are configured (`pyproject.toml:24-47`). Seven workflows already run lint, unit tests on Ubuntu and Windows, site checks, and analytics verification (`.github/workflows/tests.yml`). The packaging script already refuses symlinks, paths outside the source tree, missing required files, and unbundled manifest references (`scripts/pack_plugin.py:107-179`). The drift-report skill already exists (`skills/egm-drift-report/`).

Treating this as one eight-domain program guarantees scope creep and produces a milestone that cannot be verified. The YAGNI reviewer recommends a short gap list instead. The structural reviewer adds a second reason: a single plan touching `site/`, `scripts/`, workflows, and distributions would violate the repository's own triage taxonomy in `AGENTS.md`, which caps a Bug Fix at 100 non-test lines and fewer than three core files, and requires a Stage 1 design document for a Feature.

### The real gaps

The reviewers identified a consistent set of actual gaps:

1. **No single verification entry point.** `make test` runs only `tests/unit` (`Makefile:24-25`). Integration tests and the site's Node tests are unreachable from any Makefile target. A new contributor cannot run the full check with one command.

2. **Duplicate source trees.** `distributions/claude/`, `com.github.copilot/agents/`, `.claude-plugin/agents/`, and `.cursor-plugin/agents/` duplicate agent definitions that also exist in root `agents/`. `distributions/claude/` is already a generated artifact of `scripts/pack_plugin.py`, but the other trees are hand-maintained. This is the exact failure mode the drift-report skill exists to catch.

3. **Multiple sources of version truth.** `scripts/prepare_release.py` validates only `plugin.json`, `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json` (`scripts/prepare_release.py:30`). Any refactor that centralizes or removes a distribution manifest desyncs version validation.

4. **No type checking.** `pyproject.toml` configures ruff and pytest only. The reviewers disagree on whether this matters: the codebase is roughly 283 lines of Python across two scripts, so a repo-wide mypy/pyright gate is disproportionate.

5. **Weak observability in the release path.** `scripts/pack_plugin.py` prints one line on success and raises raw exceptions on failure (`scripts/pack_plugin.py:182-188`). `scripts/prepare_release.py` catches `Exception`, deletes the output directory, and re-raises without recording the failed phase (`scripts/prepare_release.py:84-86`). Neither script emits structured logs or error categories.

6. **Site machine-readable output is not wired.** `site/package.json` declares `starlight-llms-txt`, but `site/astro.config.mjs` does not integrate Starlight or generate `llms.txt`. `docs/site/` does not exist. The existing site is a single landing page, not the multi-page documentation site described in `docs/designs/site_documentation.md`.

7. **Coverage is unmeasured.** There is no coverage configuration and no baseline. A hard 85% gate on 283 lines of Python would be arbitrary.

8. **Integration probes are not deterministic.** `tests/integration/` contains live harness probes (`opencode_native_probe.py`, `copilot_controlled_probe.py`, `cursor_child_reads.py`) that can invoke real agent CLIs. Forcing them into the default test path would make `make test` flaky and token-expensive.

### Inventive contradictions and resolutions

The Inventive Catalyst reviewer identified three genuine contradictions and proposed resolutions from the pattern catalog. Each resolution carries a secondary trade-off that must be declared.

**Contradiction 1: one command versus verification breadth.** A single `make test` that runs unit tests, live integration probes, lint, type checks, packaging, and the Astro build would be comprehensive but slow, flaky, and expensive. *Resolution: Segmentation plus Preliminary Action.* Split the work into composable targets (`make test-unit`, `make test-integration`, `make lint`, `make typecheck`, `make site-verify`, `make package`) and add a top-level `make verify` aggregator. Cache the Astro build and pytest results so re-runs are incremental. *Secondary trade-off:* target-ordering coordination and cache-invalidation complexity; cold runs are longer. *Ideal Final Result:* `make verify` runs only what changed, with zero manual steps.

**Contradiction 2: one prompt source versus harness-specific copies.** Enforcing a single source of truth conflicts with the need to ship harness-specific adapters. *Resolution: Extraction plus Beforehand Cushioning.* Root `agents/` and `skills/` become the canonical source. Harness trees become build artifacts generated by `scripts/pack_plugin.py`. A drift check fails the build when a generated tree differs from its source. *Secondary trade-off:* a generation step, template maintenance, and generated output that must be inspected when debugging. *Ideal Final Result:* one canonical prompt source; harness packages are pure build artifacts with a verified parity test.

**Contradiction 3: strict typing versus minimal footprint.** A repo-wide type checker adds install time, CI time, and noise on small scripts. *Resolution: Segmentation plus Inversion.* Configure the type checker only on the public boundary modules (`scripts/pack_plugin.py`, `scripts/prepare_release.py`) and enforce it at the CI gate on changed files rather than the whole tree. *Secondary trade-off:* internal modules stay untyped, and the repository carries a two-tier quality bar. *Ideal Final Result:* type safety at the packaging and security boundary with no friction on exploration code.

A fourth, minor contradiction: path-traversal hardening versus packing throughput. The existing checks already resolve each path against the root (`scripts/pack_plugin.py:120-126`). *Resolution: Preliminary Action* — pre-compute the resolved allowed-root set once per build and validate with `Path.is_relative_to` against the cached root. *Secondary trade-off:* a stale root cache if the root changes mid-build, which cannot happen in practice. *Ideal Final Result:* constant-time boundary checks with no per-file filesystem resolution.

### Migration and compatibility hazards

The Migration reviewer flagged two blockers that must be resolved before any refactor:

* Removing or relocating the duplicate harness trees without a compatibility shim breaks installed plugins, the `release/claude` branch synchronization, and host-specific discovery paths. Any move needs a deprecation window, generated compatibility outputs, and a migration check that regenerates all harness trees and verifies byte-for-byte parity before deletion.
* Centralizing version validation without updating `scripts/prepare_release.py` and its tests desyncs the release flow. Either keep distribution manifests as first-class versioned artifacts or migrate all manifests atomically in one change with updated tests.

The reviewer also requires a Python 3.11 versus 3.12 compatibility matrix before enforcing a 3.11 floor, because `pyproject.toml` currently targets `py312` and CI runs 3.12.

### Security and observability requirements

The security-relevant findings are additive rather than corrective:

* `scripts/pack_plugin.py` already refuses symlinks, paths outside the source tree, missing required files, and unbundled manifest references. The missing piece is a safe extractor for the not-yet-implemented release-branch publisher described in `docs/designs/claude_release_branch_distribution.md`, which must reject absolute paths, `..` components, drive or UNC paths, backslashes, NULs, duplicate or case-colliding entries, symlinks, special files, and excessive entry counts or sizes before writing any file.
* Both scripts need structured logging with explicit error categories (validation, filesystem, archive, manifest) and enough context (target, root, output, phase) for a 3 AM triage.
* `scripts/prepare_release.py` accepts a caller-supplied commit and does not verify it identifies the checkout. The release notes already label this as a caller declaration. The workflow owns the real check.

### Cost and quota controls

The Cost reviewer requires explicit controls before any widening of the test path:

* Gate live integration probes behind an environment flag (for example `EGM_INTEGRATION=1`) and a separate Makefile target. The default `make test` must run only deterministic unit tests with mocked subprocesses.
* Define token and timeout budgets per probe.
* Add a build-time size budget for generated `llms.txt` and sitemap output.
* Define a configurable concurrency limit and memory budget for parallel agent discovery in `egm-bootstrap`.
* Specify dependency and build caching (pip/uv, npm, Astro) and explicit job timeouts.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * A prioritized, measured gap-closure list rather than an eight-domain program.
  * A `make verify` aggregator over composable sub-targets: unit tests, integration tests, lint, type check, packaging, and site verification.
  * A canonical source model: root `agents/` and `skills/` as the single source of truth, with harness trees as generated artifacts and a byte-identical CI parity check.
  * One canonical version in root `plugin.json`, with all harness manifests generated and a CI gate that fails on any mismatch.
  * Additive security hardening: structured logging with error categories, a shared safe-path helper, and a safe extractor for the release-branch publisher.
  * Build-time verification for Astro analytics, sitemap, and `llms.txt`, after confirming what `astro build` already emits.
  * A developer section in the root `README.md` (or a linked page) covering local setup, Makefile targets, environment variables, and harness distribution rules.
  * A measured coverage baseline, published as advisory until the baseline exists.
  * Decomposition into per-domain Stage 1 design documents under `docs/designs/`, following `AGENTS.md`.

* **Out-of-Scope Non-Goals:**
  * A single monolithic implementation PR spanning eight domains.
  * Removal of duplicate harness trees without a deprecation window and compatibility shims.
  * Repo-wide strict typing; if typing is adopted, it is scoped to boundary modules.
  * Live harness probes in the default `make test`.
  * Speculative performance optimization without a measured bottleneck.
  * Changes to plugin manifests, skill execution, review permissions, or host support.

## Alternatives Weighed

* **One eight-domain master plan.** Rejected in review: it re-describes machinery the repository already has and guarantees scope creep; the gap is a short measured list.
* **Strict typing across all Python modules.** Rejected in review: disproportionate for roughly 283 lines of Python across two scripts; ruff already covers undefined names, bugbear, and pyupgrade. If adopted, scope it to boundary modules and gate on changed files.
* **A single `make test` that runs unit, live integration, lint, packaging, and site checks.** Rejected in review: live probes are non-deterministic and token-heavy; the default target would become flaky and expensive.
* **Splitting shared prompt fragments from harness adapters immediately.** Rejected in review as a direct refactor: it breaks installed plugins, `release/claude` synchronization, and host discovery. The safe path is canonical source plus build-time generation plus a deprecation window.
* **Hand-maintained distribution copies.** Rejected in review: drift between copies is a known failure mode; the copies should be generated artifacts validated by CI.
* **Duplicating developer documentation into the root README.** Rejected in review: it invites drift with `CONTRIBUTING.md` and `TESTING.md`; link to them or add one focused section.
* **Optimizing fonts, SVG, and bootstrap memory now.** Rejected in review: no measured bottleneck exists; defer until a profile or issue justifies it.

## Key Decisions & Staging for Next Steps

Proposed decisions, pending author confirmation:

1. **Scope.** Treat the master prompt as a measured gap-closure list, not an eight-domain program. The first deliverable is the gap list with evidence.
2. **Canonical source.** Root `agents/` and `skills/` become the single source of truth. Harness trees become generated artifacts. CI asserts byte-identical regeneration.
3. **Version truth.** Root `plugin.json` holds the canonical version. All harness manifests are generated. A CI gate fails on any mismatch.
4. **Verification ergonomics.** Add composable Makefile targets and a `make verify` aggregator. Gate live integration probes behind an environment flag and a separate target.
5. **Additive-only script changes.** Preserve existing function signatures and error contracts in `scripts/pack_plugin.py` and `scripts/prepare_release.py`. Add a shared helper module for logging and safe-path validation.
6. **Decomposition.** Split the work into per-domain Stage 1 design documents under `docs/designs/`, each updating `docs/designs/README.md`, before any Stage 2 implementation.
7. **Site work is separate.** The multi-page documentation site described in `docs/designs/site_documentation.md` is its own feature with its own rollout. The master prompt should sequence it, not absorb it.

Staging for `/egm-draft`:

* **Phase 0 — Measure.** Record the coverage baseline, confirm whether `astro build` already emits `llms.txt` and a sitemap, measure packaged archive size, and inventory the live integration probes.
* **Phase 1 — Verification ergonomics.** Add composable Makefile targets and the `make verify` aggregator. Gate integration probes. Document environment variables.
* **Phase 2 — Canonical source and parity.** Introduce the generation model for harness trees and the byte-identical CI check. Add the canonical version gate.
* **Phase 3 — Security and observability.** Add structured logging, error categories, the shared safe-path helper, and the safe extractor for the release-branch publisher.
* **Phase 4 — Site machine-readable output.** Wire Starlight and `starlight-llms-txt` verification, preserving route and asset URL contracts.
* **Phase 5 — Documentation.** Add the developer section and the harness distribution rules.

Open questions for the author:

* Confirm the narrowed scope, or name the domains that must stay in scope.
* Decide whether to adopt type checking at all; if yes, confirm the boundary-only approach.
* Confirm the harness set: the four named in the specification, or all harnesses present in the repository.
* Confirm whether the developer documentation belongs in the root `README.md` or a separate page.
* Confirm whether there is a target date or milestone for the first phase.

## Phase 0 Baseline Evidence

Measured on 2026-11-09 against `main` at `a561b17`:

| Check | Result |
| --- | --- |
| Python toolchain | `.venv` Python 3.12.13; system `python3` is 3.15.2 without pytest |
| Unit tests | 340 passed, 2 skipped (`EGM_COPILOT_OFFLINE`, `EGM_CURSOR_BUNDLE`) |
| Site tests | 11 passed, 0 failed |
| Coverage tooling | Not installed; no baseline exists |
| Claude package | `egm-claude.zip` 128 KiB |
| OpenAI package | `egm-openai.zip` 108 KiB |
| `llms.txt` / sitemap | `astro build` emits 1 page; `dist/sitemap.xml` is a byte-identical static copy of `site/public/sitemap.xml`; no `llms.txt` emitted; `starlight-llms-txt` installed but not wired |
| Integration inventory | 4 probe scripts (`copilot_controlled_probe.py`, `cursor_child_reads.py`, `opencode_native_probe.py`, `opencode_trace_verifier.py`), 2 pytest-collectable files (`test_claude.py`, `test_codex.py`), 1 fixture directory (`opencode-ci/`) |
