# Golden-set evaluation

Deterministic contract-compliance evaluation for the optimizer, over a
fixed bilingual golden set (`golden.jsonl`, EN/ES across modes).

    EVAL_BASE_URL=http://127.0.0.1:1207/v1 EVAL_MODEL=klosraf/qwen3-4b node evals/run.mjs

The runner imports the app's real system prompts from
`src/lib/prompts.ts` (bundled at run time with esbuild — never copied),
calls any OpenAI-compatible endpoint, and asserts, per case:

- the three-region structure (`---EXPLANATION---` / `---CHANGES---`),
- change-list tagging with the single-method vocabulary,
- verbatim compliance of quoted spans (REPLACE: before ∈ original and
  after ∈ improved; ADD: after ∈ improved) — the same spans the
  per-change review feature relies on,
- preservation of required substrings (e.g. `{{variables}}`),
- the case's coverage keyword groups (constraints / output shape /
  success), and a length sanity band.

Reports land in `results/` with the full protocol header (endpoint,
model, temperature, n, date). No LLM judge is used and no quality score
is claimed: this measures contract compliance, which is the part that
can be asserted mechanically. Quality judgement remains a human/rubric
exercise on top of these reports.
