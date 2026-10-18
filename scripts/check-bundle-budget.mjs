#!/usr/bin/env node
/**
 * Bundle budget gate (synthetic CI guard, zero dependencies).
 *
 * Reads the production build in .next/static and fails (exit 1) when:
 *   - any single JS chunk exceeds MAX_CHUNK_GZKB gzipped, or
 *   - total JS exceeds TOTAL_JS_GZKB gzipped.
 *
 * Baselines measured 2026-10-18 (Next 16 + React 19 + AI SDK):
 *   max chunk 139 KB gz, total JS 454 KB gz.
 * Budgets = baseline + headroom; tighten (never loosen) when they bite.
 *
 * Usage: npm run build && npm run perf:budget
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const STATIC_DIR = join(process.cwd(), '.next', 'static');
const MAX_CHUNK_GZKB = 200;
const TOTAL_JS_GZKB = 550;

function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) jsFiles(p, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

try {
  statSync(STATIC_DIR);
} catch {
  console.error(`perf:budget: ${STATIC_DIR} missing — run 'npm run build' first.`);
  process.exit(1);
}

const files = jsFiles(STATIC_DIR);
let totalGz = 0;
let maxGz = 0;
let maxFile = '';
for (const f of files) {
  const gz = gzipSync(readFileSync(f)).length;
  totalGz += gz;
  if (gz > maxGz) {
    maxGz = gz;
    maxFile = f;
  }
}
const maxKb = maxGz / 1024;
const totalKb = totalGz / 1024;
console.log(
  `perf:budget: ${files.length} JS files, ` +
    `max chunk ${maxKb.toFixed(0)} KB gz (${maxFile.split('/').slice(-2).join('/')}), ` +
    `total ${totalKb.toFixed(0)} KB gz ` +
    `(budgets: ${MAX_CHUNK_GZKB} / ${TOTAL_JS_GZKB}).`,
);

let failed = false;
if (maxKb > MAX_CHUNK_GZKB) {
  console.error(`perf:budget FAIL: chunk ${maxKb.toFixed(0)} KB gz > ${MAX_CHUNK_GZKB} KB.`);
  failed = true;
}
if (totalKb > TOTAL_JS_GZKB) {
  console.error(`perf:budget FAIL: total ${totalKb.toFixed(0)} KB gz > ${TOTAL_JS_GZKB} KB.`);
  failed = true;
}
process.exit(failed ? 1 : 0);
