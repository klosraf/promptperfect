/**
 * Project directory analysis for the "Production Audit" flow.
 *
 * `buildProjectDigest` is pure (input: relative paths + selected file
 * contents) so it is unit-testable. The DOM-dependent directory walk lives in
 * `components/ProjectLinker.tsx`, which calls this builder. Everything runs
 * client-side: file contents never leave the browser except inside the
 * optimization request the user explicitly runs.
 */

export interface AnalyzedFile {
  /** Path relative to the linked directory, e.g. `src/app/page.tsx`. */
  path: string;
  /** File contents (already truncated by the walker). Empty when unreadable. */
  content: string;
  /** Size in bytes (approximate is fine). */
  size: number;
}

/** Hard budgets so a huge repo cannot blow up the prompt. */
export const DIGEST_BUDGETS = {
  maxFilesInTree: 300,
  maxTreeDepth: 6,
  maxContentChars: 40_000,
  maxReadmeChars: 2_000,
} as const;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vercel',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.mp4', '.mov', '.mp3', '.wav',
  '.zip', '.tar', '.gz', '.pdf',
  '.lock', '.map',
]);

const SIGNAL_FILES = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'tsconfig.json',
  'Dockerfile',
  'docker-compose.yml',
  '.github/workflows',
  '.gitlab-ci.yml',
  'README.md',
  'LICENSE',
  '.env.example',
] as const;

function extOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i).toLowerCase() : '';
}

function langOf(ext: string): string {
  switch (ext) {
    case '.ts': case '.tsx': case '.mts': return 'TypeScript';
    case '.js': case '.jsx': case '.mjs': case '.cjs': return 'JavaScript';
    case '.py': return 'Python';
    case '.rs': return 'Rust';
    case '.go': return 'Go';
    case '.json': return 'JSON';
    case '.md': case '.mdx': return 'Markdown';
    case '.css': case '.scss': return 'CSS';
    case '.html': return 'HTML';
    case '.yml': case '.yaml': return 'YAML';
    case '.toml': return 'TOML';
    case '.sql': return 'SQL';
    default: return 'other';
  }
}

/** True when the path should never enter the digest (deps, build output, VCS). */
export function isSkippedPath(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  // Never touch real secrets: only the committed `.env.example` is safe.
  const base = parts[parts.length - 1] ?? '';
  if (base.startsWith('.env') && base !== '.env.example') return true;
  if (parts.length > DIGEST_BUDGETS.maxTreeDepth + 1) return true;
  return SKIP_EXTS.has(extOf(path));
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function summarizePackageJson(pkg: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (typeof pkg.name === 'string') lines.push(`name: ${pkg.name}`);
  const scripts = pkg.scripts;
  if (typeof scripts === 'object' && scripts !== null) {
    const names = Object.keys(scripts as Record<string, unknown>);
    if (names.length) lines.push(`scripts: ${names.join(', ')}`);
  }
  for (const key of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[key];
    if (typeof deps === 'object' && deps !== null) {
      const names = Object.keys(deps as Record<string, unknown>);
      if (names.length)
        lines.push(`${key} (${names.length}): ${names.slice(0, 25).join(', ')}${names.length > 25 ? ', …' : ''}`);
    }
  }
  return lines;
}

/**
 * Build the digest text from a linked directory listing.
 * Deterministic, budget-capped, and safe for huge repos.
 */
export function buildProjectDigest(
  projectName: string,
  files: AnalyzedFile[],
): string {
  const usable = files.filter((f) => !isSkippedPath(f.path));
  const byPath = new Map(usable.map((f) => [f.path, f]));

  const tree = usable
    .map((f) => f.path)
    .sort()
    .slice(0, DIGEST_BUDGETS.maxFilesInTree);

  const byLang = new Map<string, number>();
  for (const f of usable) {
    const lang = langOf(extOf(f.path));
    byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
  }
  const langSummary = [...byLang.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang, n]) => `${lang} (${n})`)
    .join(', ');

  const out: string[] = [];
  out.push(`PROJECT DIGEST — "${projectName}" (auto-generated, local analysis)`);
  out.push(`Files analyzed: ${usable.length}. Languages: ${langSummary || 'n/a'}.`);
  out.push('');
  out.push('STRUCTURE (capped):');
  for (const p of tree) out.push(`- ${p}`);
  if (usable.length > tree.length)
    out.push(`- … and ${usable.length - tree.length} more files`);
  out.push('');

  const pkgFile = byPath.get('package.json');
  if (pkgFile) {
    const pkg = safeJsonParse(pkgFile.content);
    out.push('PACKAGE.JSON:');
    if (pkg) {
      const lines = summarizePackageJson(pkg);
      out.push(...(lines.length ? lines.map((l) => `- ${l}`) : ['- (unparseable)']));
    } else {
      out.push('- (unparseable)');
    }
    out.push('');
  }

  const signals: string[] = [];
  for (const s of SIGNAL_FILES) {
    if (s === 'package.json') continue;
    const hit = s.includes('/')
      ? [...byPath.keys()].some((p) => p.startsWith(`${s}/`))
      : byPath.has(s);
    signals.push(`${s}: ${hit ? 'yes' : 'no'}`);
  }
  const hasTests = [...byPath.keys()].some((p) =>
    /(^|\/)(__tests__|tests?|spec|e2e)\//.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p),
  );
  signals.push(`tests: ${hasTests ? 'yes' : 'no'}`);
  out.push(`SIGNALS: ${signals.join(' | ')}`);
  out.push('');

  const readme = byPath.get('README.md');
  if (readme?.content.trim()) {
    out.push('README (excerpt):');
    out.push(readme.content.trim().slice(0, DIGEST_BUDGETS.maxReadmeChars));
    out.push('');
  }

  // Key configs, highest signal first, within the content budget.
  const configPriority = [
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    'next.config.js',
    'Dockerfile',
    'docker-compose.yml',
    '.env.example',
  ];
  let budget = DIGEST_BUDGETS.maxContentChars;
  const included: string[] = [];
  for (const name of configPriority) {
    const f = byPath.get(name);
    if (!f?.content.trim() || budget <= 0) continue;
    const chunk = f.content.slice(0, budget);
    budget -= chunk.length;
    included.push(`--- ${name} ---\n${chunk}`);
  }
  if (included.length) {
    out.push('KEY FILES:');
    out.push(...included);
    out.push('');
  }

  out.push(
    'TASK: write the integral master prompt — everything this project needs ' +
    'to reach maximum refined professional production-ready level.',
  );
  return out.join('\n');
}
