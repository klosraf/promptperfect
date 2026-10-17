import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { POST } from './route';
import { redactSecrets } from '@/lib/server/localScan';

describe('POST /api/local-scan', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_UNLIMITED_MODE = 'true';
    process.env.LOCAL_SCAN_NO_EXEC = '1';
    delete process.env.LOCAL_SCAN_DIRS;
  });

  it('returns 404 when unlimited mode is off', async () => {
    delete process.env.NEXT_PUBLIC_UNLIMITED_MODE;
    delete process.env.UNLIMITED_MODE;
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: '/tmp' }),
    }));
    expect(res.status).toBe(404);
    process.env.NEXT_PUBLIC_UNLIMITED_MODE = 'true';
  });

  it('rejects missing/invalid bodies', async () => {
    for (const body of ['{}', '{"dir":""}', '{"dir":123}', 'not-json']) {
      const res = await POST(new Request('http://localhost/api/local-scan', {
        method: 'POST',
        body,
      }));
      expect([400, 403].includes(res.status)).toBe(true);
    }
  });

  it('rejects paths outside the allowlist', async () => {
    process.env.LOCAL_SCAN_DIRS = os.tmpdir();
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: '/etc' }),
    }));
    expect(res.status).toBe(403);
  });

  it('scans an allowlisted directory into a digest', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-scan-'));
    await fs.writeFile(path.join(tmp, 'README.md'), '# Demo\nA demo.');
    await fs.writeFile(path.join(tmp, 'app.ts'), 'export const a = 1;');
    process.env.LOCAL_SCAN_DIRS = tmp;
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: tmp }),
    }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      projectName: string;
      digest: string;
      fileCount: number;
    };
    expect(json.projectName).toBe(path.basename(tmp));
    expect(json.digest).toContain('README.md');
    expect(json.fileCount).toBeGreaterThan(0);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('system audit excludes data dirs and never reads secrets', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-audit-'));
    await fs.writeFile(path.join(tmp, '.zshrc'), 'export PATH=/x:$PATH');
    await fs.mkdir(path.join(tmp, 'Documents'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'Documents', 'notes.txt'), 'private notes');
    await fs.mkdir(path.join(tmp, '.ssh'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.ssh', 'id_rsa'), 'SECRET-KEY-MATERIAL');
    await fs.mkdir(path.join(tmp, 'Library/LaunchAgents'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'Library/LaunchAgents', 'com.demo.test.plist'),
      '<?xml version="1.0"?><plist><dict><key>Program</key><string>/usr/bin/true</string></dict></plist>',
    );
    process.env.LOCAL_SCAN_DIRS = tmp;
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: tmp, audit: 'system' }),
    }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      projectName: string;
      digest: string;
      audit: { launchAgents: string[] };
    };
    expect(json.projectName).toBe('system-audit-klosraf');
    expect(json.digest).toContain('.zshrc');
    expect(json.digest).toContain('com.demo.test.plist');
    expect(json.digest).not.toContain('notes.txt');
    expect(json.digest).not.toContain('SECRET-KEY-MATERIAL');
    expect(json.digest).not.toContain('id_rsa');
    expect(json.audit.launchAgents.join('\n')).toContain('com.demo.test.plist');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('redactSecrets masks secret-adjacent values, keeps structure', () => {
    const out = redactSecrets(
      '{\n  "server": "example",\n  "api_key": "sk-live-123",\n  "port": 8080\n}\n' +
        'token: abcdef\nname: demo\nkey = \"root-secret\"\n',
    );
    expect(out).toContain('"api_key": "[redacted]"');
    expect(out).toContain('token: [redacted]');
    expect(out).toContain('[redacted]');
    expect(out).toContain('"server": "example"');
    expect(out).toContain('name: demo');
    expect(out).not.toContain('sk-live-123');
    expect(out).not.toContain('abcdef');
  });

  it('system audit includes AI configs redacted + dev env pins, skips state', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-audit2-'));
    await fs.mkdir(path.join(tmp, '.cline'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, '.cline', 'mcp.json'),
      '{"inputs":[],"servers":{"gh":{"api_key":"SECRET-1"}}}',
    );
    await fs.writeFile(path.join(tmp, '.cline', 'data.sqlite'), 'binary-state');
    await fs.mkdir(path.join(tmp, '.nvm'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.nvm', 'settings.txt'), 'arch: arm64');
    await fs.writeFile(path.join(tmp, '.tool-versions'), 'nodejs 22.23.3');
    process.env.LOCAL_SCAN_DIRS = tmp;
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: tmp, audit: 'system' }),
    }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      digest: string;
      audit: { aiAgentConfigs: string[] };
    };
    expect(json.digest).toContain('.cline/mcp.json');
    expect(json.digest).toContain('[redacted]');
    expect(json.digest).not.toContain('SECRET-1');
    expect(json.digest).not.toContain('data.sqlite');
    expect(json.digest).toContain('.nvm/settings.txt');
    expect(json.digest).toContain('.tool-versions');
    expect(json.audit.aiAgentConfigs).toContain('.cline/mcp.json');
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('system audit reports critical errors + desktop profile shape', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pp-audit3-'));
    await fs.writeFile(path.join(tmp, '.zshrc'), 'export PATH=/x');
    process.env.LOCAL_SCAN_DIRS = tmp;
    const res = await POST(new Request('http://localhost/api/local-scan', {
      method: 'POST',
      body: JSON.stringify({ dir: tmp, audit: 'system' }),
    }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      digest: string;
      audit: {
        orphanAgents: string[];
        failedServices: string[];
        brokenLinks: string[];
        duplicateBins: string[];
        desktopProfile: { tilingWM: string; findings: string[] };
      };
    };
    for (const k of ['orphanAgents','failedServices','brokenLinks','duplicateBins']) {
      expect(Array.isArray((json.audit as Record<string, unknown>)[k])).toBe(true);
    }
    expect(typeof json.audit.desktopProfile.tilingWM).toBe('string');
    expect(json.digest).toContain('Critical errors');
    expect(json.digest).toContain('Desktop profile');
    await fs.rm(tmp, { recursive: true, force: true });
  });
});
