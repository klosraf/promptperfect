#!/usr/bin/env node
/**
 * Golden-set evaluation for the optimizer contract.
 *
 * Protocol (read before quoting any number): deterministic assertions
 * only — structure of the three regions, change-list tagging, verbatim
 * span compliance for quoted REPLACE/ADD changes, preservation of the
 * case's required substrings (e.g. {{variables}}), coverage keyword
 * groups declared per case, and a length sanity band. No LLM judge, no
 * quality score: this measures contract compliance of a given endpoint
 * + model against the app's real system prompts (imported from
 * src/lib/prompts.ts via esbuild, never copied).
 *
 * Usage:
 *   EVAL_BASE_URL=http://127.0.0.1:1207/v1 EVAL_MODEL=klosraf/qwen3-4b \
 *     node evals/run.mjs
 * Writes a Markdown report under evals/results/ and prints a summary.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const BASE = (process.env.EVAL_BASE_URL || "http://127.0.0.1:1207/v1").replace(/\/$/, "");
const MODEL = process.env.EVAL_MODEL || "klosraf/qwen3-4b";
const KEY = process.env.EVAL_API_KEY || "local";
const TEMP = 0;
const MAX_TOKENS = Number(process.env.EVAL_MAX_TOKENS || 1500);

// Bundle the app's real prompts module (zero-drift import).
const bundle = join(tmpdir(), `pp-prompts-${process.pid}.mjs`);
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  join(root, "src/lib/prompts.ts"),
  "--bundle",
  "--format=esm",
  `--outfile=${bundle}`,
  "--log-level=error",
]);
const { getSystemPrompt } = await import(pathToFileURL(bundle).href);

const cases = readFileSync(join(here, "golden.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

function splitRegions(text) {
  const expIdx = text.indexOf("---EXPLANATION---");
  const chgIdx = text.indexOf("---CHANGES---");
  if (expIdx === -1 || chgIdx === -1 || chgIdx < expIdx) {
    return { improved: text.trim(), explanation: "", changes: "", structured: false };
  }
  return {
    improved: text.slice(0, expIdx).trim(),
    explanation: text.slice(expIdx + 17, chgIdx).trim(),
    changes: text.slice(chgIdx + 13).trim(),
    structured: true,
  };
}

function checkCase(c, out) {
  const r = splitRegions(out);
  const checks = {};
  checks.structure = r.structured && r.improved.length > 0;
  const lines = r.changes.split("\n").map((l) => l.trim()).filter(Boolean);
  const tagged = lines.filter((l) => /^- \[(ADD|REPLACE|DELETE|EXAMPLE|STRUCTURE)\]/i.test(l));
  checks.tagged = lines.length > 0 && tagged.length >= Math.ceil(lines.length / 2);
  // Verbatim span compliance for quoted REPLACE/ADD changes.
  let spanTotal = 0;
  let spanOk = 0;
  for (const l of tagged) {
    const spans = [...l.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    const method = /^- \[(\w+)\]/i.exec(l)?.[1]?.toUpperCase();
    if (method === "REPLACE" && spans.length >= 2) {
      spanTotal += 1;
      if (r.improved.includes(spans[1]) && c.input.includes(spans[0])) spanOk += 1;
    } else if (method === "ADD" && spans.length >= 1) {
      spanTotal += 1;
      if (r.improved.includes(spans[0])) spanOk += 1;
    }
  }
  checks.spans = { total: spanTotal, ok: spanOk };
  checks.preserve = (c.preserve || []).every((p) => r.improved.includes(p));
  const low = r.improved.toLowerCase();
  checks.cover = (c.cover || []).map((group) =>
    group.length === 0 ? true : group.some((k) => low.includes(k.toLowerCase())),
  );
  const ratio = r.improved.length / Math.max(1, c.input.length);
  const maxRatio = c.maxRatio ?? 8;
  checks.length = ratio >= 0.4 && ratio <= maxRatio;
  checks.pass =
    checks.structure &&
    checks.tagged &&
    checks.preserve &&
    checks.cover.every(Boolean) &&
    checks.length;
  return { ...checks, ratio };
}

const results = [];
const rawLines = [];
for (const c of cases) {
  const t0 = Date.now();
  let out = "";
  let error = "";
  let finish = "";
  const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS || 600000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: TEMP,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: getSystemPrompt(c.mode) },
          { role: "user", content: c.input },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    out = json.choices?.[0]?.message?.content ?? "";
    finish = json.choices?.[0]?.finish_reason ?? "";
    if (!out) error = `empty content (finish_reason=${finish || "n/a"})`;
  } catch (e) {
    error = String(e?.message ?? e);
  }
  rawLines.push(
    JSON.stringify({ id: c.id, ms: Date.now() - t0, finish, error, out }),
  );
  const checks = error
    ? { pass: false, structure: false, tagged: false, preserve: false, cover: [], length: false, spans: { total: 0, ok: 0 }, ratio: 0 }
    : checkCase(c, out);
  results.push({ id: c.id, lang: c.lang, mode: c.mode, ms: Date.now() - t0, error, ...checks });
  console.log(`${checks.pass ? "PASS" : "FAIL"} ${c.id} (${Date.now() - t0} ms)${error ? " ERROR " + error : ""}`);
}

const n = results.length;
const passed = results.filter((r) => r.pass).length;
const spanTotal = results.reduce((a, r) => a + r.spans.total, 0);
const spanOk = results.reduce((a, r) => a + r.spans.ok, 0);
const rate = (x, d) => (d === 0 ? "n/a" : `${((100 * x) / d).toFixed(1)}% (${x}/${d})`);
const date = new Date().toISOString();

const md = `# Golden-set evaluation — contract compliance

Protocol: deterministic assertions only (region structure, change
tagging, verbatim quoted-span compliance, required-substring
preservation, per-case coverage keyword groups, length sanity band).
No LLM judge and no quality score is claimed. System prompts are the
app's own, imported from src/lib/prompts.ts at run time.

- Endpoint: ${BASE}
- Model: ${MODEL}
- Temperature: ${TEMP}
- Max tokens: ${MAX_TOKENS}
- Date: ${date}
- Cases: n=${n} (EN ${results.filter((r) => r.lang === "en").length} / ES ${results.filter((r) => r.lang === "es").length})

## Results

- Full pass: ${rate(passed, n)}
- Structure: ${rate(results.filter((r) => r.structure).length, n)}
- Change tagging: ${rate(results.filter((r) => r.tagged).length, n)}
- Preservation: ${rate(results.filter((r) => r.preserve).length, n)}
- Length band: ${rate(results.filter((r) => r.length).length, n)}
- Quoted spans verbatim: ${spanTotal === 0 ? "n/a (no quoted spans emitted)" : rate(spanOk, spanTotal)}

## Per case

| Case | Lang | Mode | Result | Structure | Tagged | Preserve | Cover | Length | Spans |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${results
  .map(
    (r) =>
      `| ${r.id} | ${r.lang} | ${r.mode} | ${r.pass ? "PASS" : "FAIL"} | ${r.structure ? "✓" : "✗"} | ${r.tagged ? "✓" : "✗"} | ${r.preserve ? "✓" : "✗"} | ${r.cover.map((x) => (x ? "✓" : "✗")).join("")} | ${r.length ? "✓" : "✗"} | ${r.spans.ok}/${r.spans.total} |`,
  )
  .join("\n")}
`;

mkdirSync(join(here, "results"), { recursive: true });
const file = join(here, "results", `${date.slice(0, 10)}-${MODEL.replace(/[^a-z0-9]+/gi, "-")}-${date.slice(11, 19).replace(/:/g, "")}.md`);
writeFileSync(file, md);
writeFileSync(
  join(here, "results", `${date.slice(0, 10)}-${MODEL.replace(/[^a-z0-9]+/gi, "-")}-${date.slice(11, 19).replace(/:/g, "")}.raw.jsonl`),
  rawLines.join("\n") + "\n",
);
console.log(`\nFull pass ${passed}/${n}; spans ${spanOk}/${spanTotal}; report: ${file}`);
