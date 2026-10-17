import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  buildProjectDigest,
  isBinaryPath,
  isSkippedPath,
  looksLikeBinary,
  type AnalyzedFile,
} from '@/lib/projectDigest';

/** Budgets so a huge home tree cannot blow up memory or the prompt. */
export const LOCAL_SCAN_BUDGETS = {
  maxEntries: 2500,
  maxDepth: 6,
  maxFileBytes: 12_000,
  maxListedBytes: 500_000,
} as const;

/** Extra heavy home dirs skipped on top of `isSkippedPath` (caches, libraries). */
const HOME_HEAVY_DIRS = new Set([
  'Library',
  'Applications',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  'OrbStack',
  '.Trash',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.docker',
  '.colima',
  '.orbstack',
  '.cargo',
  '.rustup',
  '.vscode',
  '.codex',
  '.claude-code-router',
  '.config',
]);

export interface LocalScanResult {
  projectName: string;
  root: string;
  digest: string;
  fileCount: number;
  scannedEntries: number;
  truncated: boolean;
  audit?: SystemAuditSummary;
}

/** Findings of the system-config audit pass (`audit=system` scans). */
export interface SystemAuditSummary {
  launchAgents: string[];
  launchDaemons: string[];
  /** Agents whose program binary is missing or whose plist failed to parse. */
  orphanAgents: string[];
  /** launchd jobs currently in nonzero-exit state (`launchctl list`). */
  failedServices: string[];
  /** Broken symlinks found in audited roots (target missing). */
  brokenLinks: string[];
  /** Toolchains resolved on PATH more than once (mise vs brew vs system). */
  duplicateBins: string[];
  brewFormulae: string[];
  brewCasks: string[];
  brewOutdated: string[];
  loginItems: string[];
  /** mise installs dir listing (`installs/<tool>/<version>`), if present. */
  miseTools: string[];
  /** Global package-manager inventory (npm/pipx/cargo/go/gem …), name@version. */
  globalPackages: string[];
  /** AI-agent config surfaces found (mcp.json, config.yaml/toml …), secrets redacted. */
  aiAgentConfigs: string[];
  /** Third-party kexts + system extensions (bundle id + version). */
  drivers: string[];
  /** Lightweight-desktop profile: tiling WM, bar, launcher, terminal status. */
  desktopProfile: DesktopProfile;
  warnings: string[];
}

/** Lightweight-dev-desktop assessment (AeroSpace-class tiling + minimal bar). */
export interface DesktopProfile {
  tilingWM: string;
  statusBar: string;
  launcher: string;
  terminal: string;
  /** Actionable findings: heavyweight compositors, duplicate helpers, gaps. */
  findings: string[];
}

/**
 * Home subtrees that are user DATA or project checkouts — never part of a
 * system-config audit. Everything else at home root (dotfiles, Brewfile,
 * `bin/`, `Library/LaunchAgents/`) is config-relevant.
 */
const AUDIT_EXCLUDE_TOP_LEVEL = new Set([
  // user data / media
  'Desktop',
  'Documents',
  'Downloads',
  'Movies',
  'Music',
  'Pictures',
  'Public',
  'Library', // handled selectively below (LaunchAgents + Preferences only)
  'Applications',
  'OrbStack',
  'pCloud Drive',
  // project checkouts / repos (code, not system config)
  'Repositorio',
  'Proyectos',
  'Prototipos',
  'dev',
  'DevForge',
  'devops',
  'CascadeProjects',
  'RustroverProjects',
  'gitRepo',
  'Home',
  'pp',
  'flokk',
  'fly',
  'krag',
  'lfs',
  'Backups',
  'logs',
  'Reports',
  'models',
  'skills-lock.json',
  'node_modules',
  'deno.lock',
  'package.json',
  'pnpm-lock.yaml',
  'biome.json',
  // caches / pure state with no config value (version managers and editor
  // dirs are NOT here — they are audited selectively via DEV_ENV_DIRS)
  '.Trash',
  '.cache',
  '.npm',
  '.pnpm-store',
  '.docker',
  '.colima',
  '.orbstack',
  '.electron-gyp',
  '.gradle',
  '.hex',
  '.julia',
  '.juliaup',
  '.m2',
  '.matplotlib',
  '.nuget',
  '.serverless',
  '.terraform.d',
  // AI-agent dirs stay out of the generic walk — selective files only
  // via AI_AGENT_DIRS below
  '.codex',
  '.claude-code-router',
  '.opencode',
  '.aitk',
  '.codeium',
  '.cursor',
  '.windsurf',
  // secret material — never read, never list contents
  '.ssh',
  '.gnupg',
  '.aws',
  '.azure',
  '.gcloud',
  '.kube',
  '.docker',
  '.git-credentials',
  '.netrc',
  '.env.ai-providers',
  '.env.local-ai',
  '.erlang.cookie',
  '.mcp-auth',
  '.claude.json',
  // agent/tool runtime state (logs, pids, tokens, sqlite) — not config
  '.9remote',
  '.9router',
  '.ServiceHub',
  '.claude_key_logs',
  '.claude-server-commander',
  '.claude-switcher',
  '.hardware_audit',
  '.ai-audit-backup',
  '.aider.conf.yml',
]);

/**
 * AI-agent / dev-agent home dirs whose CONFIG surfaces are audited
 * selectively (allowlisted file names only — see `AI_CONFIG_FILES`).
 * Everything else inside them (sessions, caches, attachments, tokens)
 * is excluded.
 */
const AI_AGENT_DIRS = new Set([
  '.claude',
  '.codex',
  '.cline',
  '.cursor',
  '.windsurf',
  '.aider',
  '.continue',
  '.opencode',
  '.agents',
  '.codeium',
  '.copilot',
  '.gemini',
  '.augment',
  '.junie',
  '.auggie',
  '.amp',
  '.kilocode',
  '.roo',
  '.cody',
  '.tabnine',
  '.sourcegraph',
  '.supermaven',
]);

/**
 * File names (exact or suffix) audited inside `AI_AGENT_DIRS` and versioned
 * backups of the same. Sessions, transcripts, tokens, and key files are
 * deliberately absent — secret-adjacent material stays out.
 */
const AI_CONFIG_FILES = new Set([
  'mcp.json',
  'config.json',
  'config.yaml',
  'config.yml',
  'config.toml',
  'settings.json',
  'permissions.yaml',
  'AGENTS.md',
]);

/** True for versioned backup siblings (`config.yaml.bak-*`, `*.backup-*`). */
function isBackupConfig(name: string): boolean {
  return (
    /\.bak([-_.].*)?$/.test(name) ||
    /\.backup([-_.].*)?$/.test(name) ||
    /\.orig$/.test(name)
  );
}

/**
 * Dev-environment / toolchain home dirs audited SELECTIVELY: only the listed
 * relative config surfaces are read (settings, manifests, version pins).
 * Install trees, caches, and downloads inside them are never walked.
 */
const DEV_ENV_SELECTIVE: Record<string, string[]> = {
  '.nvm': ['settings.txt'],
  '.pyenv': ['version'],
  '.rbenv': ['version'],
  '.sdkman': ['etc/config'],
  '.cargo': ['config.toml', 'config'],
  '.rustup': ['settings.toml'],
  '.bundle': ['config'],
  '.composer': ['composer.json', 'composer.lock', 'config.json'],
  '.gem': [],
  '.dotnet': [],
  '.vscode': ['settings.json', 'keybindings.json', 'extensions.json'],
  '.local': ['bin'],
};

/** Keys whose values are replaced with `[redacted]` in audited JSON/YAML/TOML. */
const SECRET_KEY_RE = /(token|secret|password|passwd|api[_-]?key|auth|bearer|session|cookie|private[_-]?key|client[_-]?secret)/i;

/**
 * Best-effort secret redaction for audited config text. Masks JSON string
 * values (`"key": "value"`), YAML assignments (`key: value`), and TOML
 * assignments (`key = "value"`) when the key looks secret-adjacent. Structure
 * (keys, nesting, server names, command arrays) is preserved for the audit.
 */
export function redactSecrets(text: string): string {
  // Inline JSON `"secretKey": "value"` anywhere in the line (single-line files).
  const inlineJson = text.replace(
    /("[^"]*?(?:token|secret|password|passwd|api[_-]?key|auth|bearer|session|cookie|private[_-]?key|client[_-]?secret)[^"]*?"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
    '$1"[redacted]"',
  );
  return inlineJson
    .split('\n')
    .map((line) => {
      const jsonEq = line.match(/^(\s*"[^"]*"\s*:\s*)"(.*)"(\s*,?\s*)$/);
      if (jsonEq?.[1] && SECRET_KEY_RE.test(jsonEq[1])) {
        return `${jsonEq[1]}"[redacted]"${jsonEq[3] ?? ''}`;
      }
      const kv = line.match(/^(\s*[^=:[\]{},#\s][^=:]*?)\s*[:=]\s*(.+?)\s*$/);
      if (kv?.[1] && kv[2] && SECRET_KEY_RE.test(kv[1])) {
        const quote = kv[2].trimStart().startsWith('"') ? '"' : kv[2].trimStart().startsWith("'") ? "'" : '';
        return quote
          ? `${kv[1]}: ${quote}[redacted]${quote}`
          : `${kv[1]}: [redacted]`;
      }
      return line;
    })
    .join('\n');
}

/** True when a filename is an audited AI-agent config surface. */
function isAiConfigFile(name: string): boolean {
  if (AI_CONFIG_FILES.has(name)) return true;
  if (!isBackupConfig(name)) return false;
  const base = name.replace(/\.(bak([-_.].*)?|backup([-_.].*)?|orig)$/, '');
  return AI_CONFIG_FILES.has(base) || [...AI_CONFIG_FILES].some((c) => base.endsWith(c));
}

/**
 * Allowlisted roots for local scans. Local-dev only — the route rejects when
 * unlimited mode is off. Defaults cover the requested home plus the repo cwd;
 * override with `LOCAL_SCAN_DIRS` (comma-separated absolute paths).
 */
export function getLocalScanRoots(): string[] {
  const raw = (process.env.LOCAL_SCAN_DIRS ?? '').trim();
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => path.normalize(s));
  }
  const home = os.homedir();
  return [home, '/Users/klosraf', process.cwd()].filter(Boolean).map((s) => path.normalize(s));
}

/** True when `abs` (already normalized) sits inside one of `roots`. */
export function isPathAllowed(abs: string, roots: string[]): boolean {
  const norm = path.normalize(abs);
  return roots.some((r) => {
    const root = path.normalize(r);
    return norm === root || norm.startsWith(root + path.sep);
  });
}

async function readFileCapped(abs: string): Promise<string> {
  try {
    const fh = await fs.open(abs, 'r');
    try {
      const stat = await fh.stat();
      if (stat.size === 0 || stat.isDirectory()) return '';
      const len = Math.min(stat.size, LOCAL_SCAN_BUDGETS.maxFileBytes);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, 0);
      return buf.toString('utf8');
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}

interface WalkState {
  out: AnalyzedFile[];
  entries: number;
  truncated: boolean;
}

/** Dir/file names that are cache/state anywhere in the tree — never config. */
const AUDIT_DENY_NAMES = new Set([
  'compile-cache',
  'blob-store',
  'Cache',
  'Caches',
  'CachedData',
  'Code Cache',
  'Crash Reports',
  'Logs',
  'logs',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  // AI-agent runtime state (sessions, transcripts, attachments, caches).
  // NOTE: `data` is NOT here — `~/.local/share` is a legit config root.
  // AI-dir state is filtered by the selective AI_AGENT_DIRS walk instead.
  'sessions',
  'transcripts',
  'attachments',
  'chats',
  'tmp',
  '.tmp',
]);

/** True when any path segment is a denied cache/state name. */
function isAuditDeniedPath(rel: string): boolean {
  return rel.split('/').some((seg) => AUDIT_DENY_NAMES.has(seg));
}

/** Top-level home entries with system-config value (dotfiles, bin, Brewfile). */
function isAuditTopLevel(name: string): boolean {
  if (AUDIT_EXCLUDE_TOP_LEVEL.has(name)) return false;
  if (name === 'bin' || name === 'Brewfile' || name === '.config') return true;
  // dotfiles / dot-dirs at home root are config by definition
  return name.startsWith('.');
}

async function listDirNames(abs: string): Promise<string[]> {
  try {
    const ents = await fs.readdir(abs, { withFileTypes: true });
    return ents.filter((e) => e.isFile() || e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Parse ProgramArguments / Program from a launchd plist (best-effort). */
async function readPlistProgram(abs: string): Promise<string | null> {
  try {
    const text = (await readFileCapped(abs)).trim();
    if (!text) return null;
    const args = text.match(
      /<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/,
    );
    if (args?.[1]) {
      const items = [...args[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) =>
        (m[1] ?? '').trim(),
      );
      if (items.length) return items.join(' ');
    }
    const prog = text.match(/<key>\s*Program\s*<\/key>\s*<string>([^<]*)<\/string>/);
    if (prog?.[1]) return prog[1].trim();
    return null;
  } catch {
    return null;
  }
}
async function walk(
  abs: string,
  rel: string,
  depth: number,
  state: WalkState,
): Promise<void> {
  if (state.entries >= LOCAL_SCAN_BUDGETS.maxEntries) {
    state.truncated = true;
    return;
  }
  let dirents;
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  // Stable order so digests are reproducible; hidden entries last.
  dirents.sort((a, b) => {
    const ah = a.name.startsWith('.') ? 1 : 0;
    const bh = b.name.startsWith('.') ? 1 : 0;
    if (ah !== bh) return ah - bh;
    return a.name.localeCompare(b.name);
  });
  for (const d of dirents) {
    if (state.entries >= LOCAL_SCAN_BUDGETS.maxEntries) {
      state.truncated = true;
      return;
    }
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    const childAbs = path.join(abs, d.name);
    try {
      if (d.isSymbolicLink()) continue; // never follow symlinks (cycles/escapes)
      if (isAuditDeniedPath(childRel)) continue; // cache/state — never config
      if (d.isDirectory()) {
        if (HOME_HEAVY_DIRS.has(d.name)) continue;
        if (isSkippedPath(childRel)) continue;
        if (depth + 1 > LOCAL_SCAN_BUDGETS.maxDepth) continue;
        await walk(childAbs, childRel, depth + 1, state);
        continue;
      }
      if (!d.isFile()) continue;
      if (isSkippedPath(childRel)) continue;
      state.entries += 1;
      let size = 0;
      try {
        size = (await fs.stat(childAbs)).size;
      } catch {
        continue;
      }
      if (size > LOCAL_SCAN_BUDGETS.maxListedBytes || isBinaryPath(childRel)) {
        state.out.push({ path: childRel, content: '', size, binary: true });
        continue;
      }
      const content = await readFileCapped(childAbs);
      if (looksLikeBinary(content)) {
        state.out.push({ path: childRel, content: '', size, binary: true });
      } else {
        state.out.push({ path: childRel, content, size });
      }
    } catch {
      // unreadable entry — skip silently
    }
  }
}

/**
 * Scan a local directory (server-side, local-dev only) and build the same
 * digest the browser picker produces. Caller must gate on unlimited mode and
 * `isPathAllowed` before invoking.
 *
 * With `audit: 'system'`, the walk is restricted to system/app configuration:
 * home dotfiles + `bin/` + `Brewfile` + `Library/LaunchAgents/` +
 * `Library/Preferences/` (+ `/Library/LaunchDaemons`, `/etc` host config and
 * Homebrew taps when the root is the home dir). User data, project checkouts,
 * caches, and secret stores are excluded — see `AUDIT_EXCLUDE_TOP_LEVEL`.
 */
export async function scanLocalDirectory(
  absRoot: string,
  opts: { audit?: 'system' } = {},
): Promise<LocalScanResult> {
  const root = path.normalize(absRoot);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('Not a directory');
  if (opts.audit === 'system') {
    return scanSystemAudit(root);
  }
  const state: WalkState = { out: [], entries: 0, truncated: false };
  await walk(root, '', 0, state);
  const projectName = path.basename(root) || root;
  const digest = buildProjectDigest(projectName, state.out);
  return {
    projectName,
    root,
    digest,
    fileCount: state.out.length,
    scannedEntries: state.entries,
    truncated: state.truncated,
  };
}

/** Run a binary with args, return stdout or '' (never throws). */
function runCapture(bin: string, args: string[], timeoutMs: number): Promise<string> {
  // Tests must not spawn real tools (brew/osascript are slow or interactive).
  if (process.env.LOCAL_SCAN_NO_EXEC === '1') return Promise.resolve('');
  return import('node:child_process').then(({ execFile }) => (
    new Promise<string>((resolve) => {
      execFile(bin, args, { timeout: timeoutMs }, (err, stdout) => {
        resolve(err ? '' : String(stdout));
      });
    })
  ));
}

/** Broken symlinks directly inside audited roots (depth 1, never recursive). */
async function findBrokenLinks(dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const d of dirs) {
    let ents: import('node:fs').Dirent[];
    try {
      ents = await fs.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (!e.isSymbolicLink()) continue;
      try {
        await fs.stat(path.join(d, e.name));
      } catch {
        if (out.length < 60) out.push(path.join(d, e.name));
      }
    }
  }
  return out;
}

/** Toolchains resolving more than once on PATH (shadowed installs). */
async function findDuplicateBins(tools: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const t of tools) {
    const hits = await runCapture('/bin/zsh', ['-lc', `which -a ${t} 2>/dev/null`], 8000);
    const paths = hits.split('\n').map((l) => l.trim()).filter(Boolean);
    if (paths.length > 1) out.push(`${t}: ${paths.join(' | ')}`);
  }
  return out;
}

/** launchd jobs currently in nonzero-exit state. */
async function findFailedServices(): Promise<string[]> {
  const raw = await runCapture('launchctl', ['list'], 15000);
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+\s+[1-9]\d*\s+\S+/.test(l))
    .slice(0, 40);
}

/** Lightweight-desktop assessment from brew inventory + walked configs. */
async function assessDesktop(
  formulae: string[],
  casks: string[],
  walked: Set<string>,
  homeRoot: string,
): Promise<DesktopProfile> {
  const has = (n: string) => formulae.includes(n) || casks.includes(n);
  const tilingWM = has('aerospace')
    ? 'aerospace (tiling, native)'
    : has('yabai')
      ? 'yabai (tiling, scripting-addition)'
      : has('amethyst')
        ? 'amethyst (tiling)'
        : '(none detected)';
  const statusBar = has('sketchybar') ? 'sketchybar (lightweight)' : 'menu-bar-only';
  const launcher = has('raycast') ? 'raycast' : has('alfred') ? 'alfred' : 'spotlight';
  const terminal = has('ghostty')
    ? 'ghostty (GPU, low-RAM)'
    : has('wezterm')
      ? 'wezterm'
      : has('iterm2')
        ? 'iterm2'
        : 'terminal.app';
  const findings: string[] = [];
  if (has('aerospace') && !walked.has('.config/aerospace/aerospace.toml')) {
    // Budget may starve .config — confirm on disk via listDirNames caller data.
    // Caller passes homeRoot; check the real file to avoid false positives.
    try {
      await fs.access(path.join(homeRoot, '.config/aerospace/aerospace.toml'));
    } catch {
      findings.push('aerospace installed but no checked-in config');
    }
  }
  if (!has('sketchybar')) {
    findings.push('no lightweight status bar (sketchybar) — menu-bar widgets cost more');
  }
  if (has('rectangle') && has('aerospace')) {
    findings.push('rectangle + aerospace overlap: pick one window manager');
  }
  if (has('docker-desktop')) {
    findings.push('docker-desktop is heavy; consider colima/orbstack headless');
  }
  if (has('iterm2') && has('ghostty')) {
    findings.push('two GPU terminals installed; standardize on ghostty');
  }
  return { tilingWM, statusBar, launcher, terminal, findings };
}

/** Push one file only if it exists (optional configs like mise). */
async function pushFileIfExists(
  abs: string,
  rel: string,
  pushFile: (abs: string, rel: string) => Promise<void>,
  state: WalkState,
): Promise<void> {
  if (state.entries >= LOCAL_SCAN_BUDGETS.maxEntries) return;
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return;
  } catch {
    return;
  }
  await pushFile(abs, rel);
}

/**
 * System-config audit: curated roots only — home dotfiles + `bin/` +
 * `Brewfile` + `.config/` (state dirs skipped) + user LaunchAgents +
 * user Preferences + system LaunchDaemons + Homebrew inventory.
 */
async function scanSystemAudit(homeRoot: string): Promise<LocalScanResult> {
  const state: WalkState = { out: [], entries: 0, truncated: false };
  const warnings: string[] = [];
  const aiAgentConfigs: string[] = [];
  const scanRoot = async (abs: string, rel: string, depth: number): Promise<void> => {
    await walk(abs, rel, depth, state);
  };
  /**
   * Add one walked file to the digest, applying binary caps. AI-agent config
   * files pass through `redactSecrets`; everything else verbatim.
   */
  const pushFile = async (abs: string, rel: string): Promise<void> => {
    if (isSkippedPath(rel) || isAuditDeniedPath(rel)) return;
    state.entries += 1;
    let size = 0;
    try {
      size = (await fs.stat(abs)).size;
    } catch {
      return;
    }
    if (size > LOCAL_SCAN_BUDGETS.maxListedBytes || isBinaryPath(rel)) {
      state.out.push({ path: rel, content: '', size, binary: true });
      return;
    }
    const raw = await readFileCapped(abs);
    if (looksLikeBinary(raw)) {
      state.out.push({ path: rel, content: '', size, binary: true });
      return;
    }
    const base = path.basename(rel);
    const content = isAiConfigFile(base) ? redactSecrets(raw) : raw;
    state.out.push({ path: rel, content, size });
  };

  let top: import('node:fs').Dirent[];
  try {
    top = await fs.readdir(homeRoot, { withFileTypes: true });
  } catch {
    throw new Error('Could not read that directory');
  }
  // AI-agent config surfaces: selective files at dir top level + MCP extras.
  for (const agentDirName of AI_AGENT_DIRS) {
    const absDir = path.join(homeRoot, agentDirName);
    let kids: import('node:fs').Dirent[];
    try {
      kids = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      if (state.entries >= LOCAL_SCAN_BUDGETS.maxEntries) {
        state.truncated = true;
        break;
      }
      try {
        if (k.isSymbolicLink()) continue;
        // AI-dir runtime state is never config (lowercase compare for State/ etc.)
        const klow = k.name.toLowerCase();
        if (
          klow === 'sessions' || klow === 'transcripts' || klow === 'attachments' ||
          klow === 'chats' || klow === 'history' || klow === 'backups' ||
          klow === 'tmp' || klow === '.tmp' || klow === 'bin' || klow === 'data' ||
          klow === 'logs' || klow === 'cache' || klow === 'caches' || klow === 'skills'
        ) continue;
        const rel = `${agentDirName}/${k.name}`;
        if (k.isFile()) {
          if (!isAiConfigFile(k.name)) continue;
          // state-adjacent extensions are never audited even if allowlisted
          if (/\.(sqlite.*|db|log|pem|key)$/i.test(k.name)) continue;
          await pushFile(path.join(absDir, k.name), rel);
          aiAgentConfigs.push(rel);
        } else if (k.isDirectory()) {
          // MCP server dirs: audit manifests only, never node_modules/caches
          if (k.name === 'mcp' || k.name === 'mcp-servers' || k.name === 'plugins') {
            const grand = await listDirNames(path.join(absDir, k.name));
            for (const g of grand) {
              if (g === 'node_modules' || isAuditDeniedPath(g)) continue;
              const gAbs = path.join(absDir, k.name, g);
              try {
                const st = await fs.stat(gAbs);
                if (!st.isFile()) continue;
              } catch {
                continue;
              }
              if (!isAiConfigFile(g) && g !== 'package.json') continue;
              await pushFile(gAbs, `${rel}/${g}`);
              aiAgentConfigs.push(`${rel}/${g}`);
            }
          }
        }
      } catch {
        // unreadable entry — skip silently
      }
    }
  }

  // Dev-environment / toolchain configs: selective surfaces only.
  const envConfigs: string[] = [];
  for (const [envDir, surfaces] of Object.entries(DEV_ENV_SELECTIVE)) {
    for (const surf of surfaces) {
      const rel = `${envDir}/${surf}`;
      if (isAuditDeniedPath(rel)) continue;
      const before = state.out.length;
      await pushFileIfExists(path.join(homeRoot, rel), rel, pushFile, state);
      if (state.out.length > before) envConfigs.push(rel);
    }
    // version pin files at env-dir top level (`.nvmrc`, `.python-version`…)
    if (envDir === '.nvm' || envDir === '.pyenv' || envDir === '.rbenv') {
      for (const pin of ['.nvmrc', '.python-version', '.ruby-version', '.node-version']) {
        const rel = `${envDir}/${pin}`;
        const before = state.out.length;
        await pushFileIfExists(path.join(homeRoot, rel), rel, pushFile, state);
        if (state.out.length > before) envConfigs.push(rel);
      }
    }
  }
  // toolchain version pins at home root + mise global contract (dup-safe)
  for (const pin of ['.tool-versions', '.mise.toml', 'mise.toml', '.node-version', '.python-version']) {
    const before = state.out.length;
    await pushFileIfExists(path.join(homeRoot, pin), pin, pushFile, state);
    if (state.out.length > before) envConfigs.push(pin);
  }

  const dotCfgSkip = new Set(['backups', 'docs', 'changelog']);
  for (const ent of top) {
    if (state.entries >= LOCAL_SCAN_BUDGETS.maxEntries) {
      state.truncated = true;
      break;
    }
    const name = ent.name;
    try {
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (!isAuditTopLevel(name)) continue;
        // AI-agent dirs are audited selectively below — skip the generic walk
        if (AI_AGENT_DIRS.has(name)) continue;
        if (name === '.config') {
          const kids = await listDirNames(path.join(homeRoot, name));
          for (const k of kids) {
            if (dotCfgSkip.has(k)) continue;
            await scanRoot(path.join(homeRoot, name, k), `.config/${k}`, 1);
          }
          continue;
        }
        // go workspace: only env config + installed binaries, never src/pkg
        if (name === 'go') {
          await pushFileIfExists(path.join(homeRoot, 'go/env'), 'go/env', pushFile, state);
          continue;
        }
        if (isAuditDeniedPath(name)) continue;
        await scanRoot(path.join(homeRoot, name), name, 0);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!isAuditTopLevel(name)) continue;
      await pushFile(path.join(homeRoot, name), name);
    } catch {
      // unreadable entry — skip silently
    }
  }

  await scanRoot(path.join(homeRoot, 'Library/LaunchAgents'), 'Library/LaunchAgents', 0);
  await scanRoot(path.join(homeRoot, 'Library/Preferences'), 'Library/Preferences', 0);

  const agentDir = path.join(homeRoot, 'Library/LaunchAgents');
  const daemonDir = '/Library/LaunchDaemons';
  const agentFiles = (await listDirNames(agentDir)).filter((f) => f.endsWith('.plist'));
  const daemonFiles = (await listDirNames(daemonDir)).filter((f) => f.endsWith('.plist'));
  const launchAgents: string[] = [];
  for (const f of agentFiles) {
    const prog = await readPlistProgram(path.join(agentDir, f));
    launchAgents.push(prog ? `${f} -> ${prog}` : f);
    if (prog && !f.endsWith('.disabled')) {
      const bin = prog.split(' ')[0] ?? '';
      if (bin && path.isAbsolute(bin)) {
        try {
          await fs.access(bin);
        } catch {
          warnings.push(`orphan agent: ${f} points at missing ${bin}`);
        }
      }
    }
  }
  const launchDaemons: string[] = [];
  for (const f of daemonFiles) {
    const prog = await readPlistProgram(path.join(daemonDir, f));
    launchDaemons.push(prog ? `${f} -> ${prog}` : f);
  }

  const formulae = (await runCapture('brew', ['list', '--formula', '-1'], 20_000))
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const casks = (await runCapture('brew', ['list', '--cask', '-1'], 20_000))
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (!formulae.length && !casks.length) warnings.push('brew inventory empty/unavailable');

  // Outdated brew packages (update surface for the audit plan).
  const brewOutdated = (await runCapture('brew', ['outdated', '--verbose'], 60_000))
    .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 100);

  // mise toolchain inventory: installs/<tool>/<version> listing (no binaries).
  const miseTools: string[] = [];
  const miseInstalls = path.join(homeRoot, '.local/share/mise/installs');
  for (const tool of await listDirNames(miseInstalls)) {
    const vers = await listDirNames(path.join(miseInstalls, tool));
    if (vers.length) miseTools.push(`${tool}: ${vers.join(', ')}`);
  }
  // mise global config (the pinned toolchain contract).
  await pushFileIfExists(
    path.join(homeRoot, '.config/mise/config.toml'),
    '.config/mise/config.toml',
    pushFile, state,
  );

  // Global package-manager inventory (names + versions, never code).
  const globalPackages: string[] = [];
  const npmGlobal = (await runCapture('npm', ['ls', '-g', '--depth=0', '--json'], 20_000)).trim();
  if (npmGlobal) {
    try {
      const deps = (JSON.parse(npmGlobal) as { dependencies?: Record<string, { version?: string }> }).dependencies ?? {};
      for (const [n, m] of Object.entries(deps)) globalPackages.push(`npm:${n}@${m.version ?? '?'}`);
    } catch { /* unparseable — skip */ }
  }
  const pipxList = (await runCapture('pipx', ['list', '--short'], 20_000)).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const p of pipxList.slice(0, 60)) globalPackages.push(`pipx:${p}`);
  const cargoList = (await runCapture('cargo', ['install', '--list'], 20_000)).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const c of cargoList.filter((l) => l.includes('v')).slice(0, 60)) globalPackages.push(`cargo:${c}`);
  const goBin = await listDirNames(path.join(homeRoot, 'go/bin'));
  for (const g of goBin.slice(0, 60)) globalPackages.push(`go-bin:${g}`);
  const gemList = (await runCapture('gem', ['list', '--local'], 20_000)).split('\n').map((s) => s.trim()).filter(Boolean);
  for (const g of gemList.slice(0, 60)) globalPackages.push(`gem:${g}`);

  // Driver inventory: third-party kexts + active system extensions.
  const drivers: string[] = [];
  const kextRaw = await runCapture('kextstat', ['-l'], 15_000);
  for (const line of kextRaw.split('\n')) {
    const m = line.match(/^\s*\d+\s+\d+\s+0x[0-9a-f]+\s+0x[0-9a-f]+\s+0x[0-9a-f]+\s+(\S+)\s+\(([^)]+)\)/);
    if (m?.[1] && m[2] && !m[1].startsWith('com.apple.')) drivers.push(`kext:${m[1]} (${m[2]})`);
  }
  const sysexRaw = await runCapture('systemextensionsctl', ['list'], 15_000);
  for (const line of sysexRaw.split('\n')) {
    const m = line.match(/^[* ]\s+[* ]\s+\S+\s+(\S+)\s+\(([^)]+)\)/);
    if (m?.[1] && m[2]) drivers.push(`sysex:${m[1]} (${m[2]})`);
  }

  const loginRaw = await runCapture(
    'osascript',
    ['-e', 'tell application "System Events" to get the name of every login item'],
    10_000,
  );
  const loginItems = loginRaw.split(',').map((s) => s.trim()).filter(Boolean);

  // Critical-error detectors: orphans already in warnings; failed jobs, broken
  // links, and shadowed toolchains get their own sections.
  const orphanAgents = warnings
    .filter((w) => w.startsWith('orphan agent:'))
    .map((w) => w.replace(/^orphan agent: /, ''));
  const failedServices = await findFailedServices();
  const brokenLinks = await findBrokenLinks([
    homeRoot,
    path.join(homeRoot, 'bin'),
    path.join(homeRoot, '.local/bin'),
  ]);
  const duplicateBins = await findDuplicateBins([
    'node', 'npm', 'pnpm', 'yarn', 'bun', 'deno',
    'python3', 'pipx', 'cargo', 'go', 'gem', 'ruby', 'java',
    'psql', 'redis-server',
  ]);
  for (const d of duplicateBins) warnings.push(`shadowed toolchain: ${d}`);
  for (const b of brokenLinks) warnings.push(`broken link: ${b}`);
  for (const f of failedServices) warnings.push(`failed service: ${f}`);

  // Lightweight-desktop profile (tiling WM + minimal bar + launcher + terminal).
  const walkedPaths = new Set(state.out.map((f) => f.path));
  const desktopProfile = await assessDesktop(formulae, casks, walkedPaths, homeRoot);
  for (const f of desktopProfile.findings) warnings.push(`desktop: ${f}`);

  const projectName = 'system-audit-klosraf';
  const baseDigest = buildProjectDigest(projectName, state.out, {
    configPriority: [
      '.zshrc',
      '.zprofile',
      '.bashrc',
      '.bash_profile',
      '.gitconfig',
      '.gitignore_global',
      'Brewfile',
      '.mackup.cfg',
      'bin/mac-fluido.sh',
      '.config/aerospace/aerospace.toml',
      '.config/ghostty/config',
      '.config/btop/btop.conf',
      '.config/bat/config',
      '.config/git/config',
      '.config/launchd/dev-env.sh',
      '.config/mise/config.toml',
      '.claude/settings.json',
      '.codex/config.toml',
      '.cline/mcp.json',
      '.cursor/mcp.json',
      '.continue/config.yaml',
      'Library/LaunchAgents/com.klosraf.mac-fluido.plist',
      'Library/LaunchAgents/com.klosraf.maintenance.plist',
    ],
  });
  const ff = formulae.length > 60 ? `${formulae.slice(0, 60).join(', ')}, …` : formulae.join(', ');
  const sections = [
    baseDigest,
    '',
    'SYSTEM AUDIT (live inventory):',
    `LaunchAgents (${launchAgents.length}):`,
    ...launchAgents.map((l) => `- ${l}`),
    `LaunchDaemons (${launchDaemons.length}):`,
    ...launchDaemons.map((l) => `- ${l}`),
    `Brew formulae (${formulae.length}): ${ff || '(none)'}`,
    `Brew casks (${casks.length}): ${casks.join(', ') || '(none)'}`,
    `Brew outdated (${brewOutdated.length}):`,
    ...brewOutdated.slice(0, 40).map((l) => `- ${l}`),
    `mise toolchains (${miseTools.length}):`,
    ...miseTools.map((l) => `- ${l}`),
    `Env config surfaces (${envConfigs.length}): ${envConfigs.join(', ') || '(none)'}`,
    `Global packages (${globalPackages.length}):`,
    ...globalPackages.slice(0, 60).map((l) => `- ${l}`),
    `AI agent configs (${aiAgentConfigs.length}): ${aiAgentConfigs.join(', ') || '(none)'}`,
    `Drivers — kexts + system extensions (${drivers.length}):`,
    ...drivers.map((l) => `- ${l}`),
    `Critical errors — orphan agents (${orphanAgents.length}):`,
    ...orphanAgents.map((l) => `- FIX: ${l}`),
    `Critical errors — failed services (${failedServices.length}):`,
    ...failedServices.map((l) => `- FIX: ${l}`),
    `Critical errors — broken links (${brokenLinks.length}):`,
    ...brokenLinks.map((l) => `- FIX: ${l}`),
    `Critical errors — shadowed toolchains (${duplicateBins.length}):`,
    ...duplicateBins.map((l) => `- FIX: ${l}`),
    'Desktop profile (lightweight dev):',
    `- tiling WM: ${desktopProfile.tilingWM}`,
    `- status bar: ${desktopProfile.statusBar}`,
    `- launcher: ${desktopProfile.launcher}`,
    `- terminal: ${desktopProfile.terminal}`,
    ...desktopProfile.findings.map((l) => `- DESKTOP: ${l}`),
    `Login items (${loginItems.length}): ${loginItems.join(', ') || '(none detected)'}`,
    warnings.length ? `Warnings (${warnings.length}):` : 'Warnings: none',
    ...warnings.map((w) => `- ${w}`),
    '',
    'TASK: write the integral master prompt — audit this macOS system configuration ' +
      '(shell, git, brew + outdated, mise toolchains, global packages, AI-agent MCP configs, ' +
      'launchd agents/daemons, drivers/kexts/sysex, app prefs) for version conflicts, duplicates, ' +
      'orphans, outdated drivers, and security issues; then produce the ordered, ' +
      'idempotent remediation and optimization plan scoped to THIS inventory. ' +
      'Include: (1) critical-error fixes with exact commands (unload/disable orphans, ' +
      'relink/remove broken links, pin one toolchain per language via mise, restart failed services); ' +
      '(2) lightweight desktop setup (tiling WM + minimal bar + one launcher + one GPU terminal, ' +
      'kill heavy duplicates, cap login items, defer heavy daemons); ' +
      'End with a sequenced action plan (now / next / later).',
  ];
  return {
    projectName,
    root: homeRoot,
    digest: sections.join('\n'),
    fileCount: state.out.length,
    scannedEntries: state.entries,
    truncated: state.truncated,
    audit: {
      launchAgents,
      launchDaemons,
      orphanAgents,
      failedServices,
      brokenLinks,
      duplicateBins,
      brewFormulae: formulae,
      brewCasks: casks,
      brewOutdated,
      loginItems,
      miseTools,
      globalPackages,
      aiAgentConfigs,
      drivers,
      desktopProfile,
      warnings,
    },
  };
}
