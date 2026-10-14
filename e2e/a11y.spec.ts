import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Playwright specs run as CommonJS, so `require.resolve` is available.
const axeSource = readFileSync(require.resolve('axe-core/axe.js'), 'utf8');

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: unknown[];
}

async function analyzeViolations(page: import('@playwright/test').Page) {
  // Inject the axe-core browser build (self-defines window.axe).
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            ctx: Document,
            opts: unknown,
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    if (!axe) throw new Error('axe-core failed to load in the page');
    const { violations } = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length }));
  });
}

const PATHS = ['/', '/login', '/docs'];

/**
 * Real-browser accessibility. We GATE on `critical` violations (unnamed
 * controls, broken ARIA/roles). color-contrast reports as serious and
 * depends on the still-open muted-grey design decision, so serious results
 * are attached to the report for review instead of failing the build.
 */
for (const path of PATHS) {
  test(`axe: no critical violations on ${path}`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.waitForLoadState('load');

    const violations = await analyzeViolations(page);

    const critical = violations.filter((v) => v.impact === 'critical');
    expect(
      critical.map((v) => ({ id: v.id, help: v.help })),
      `critical axe violations on ${path}`,
    ).toEqual([]);

    const serious = violations.filter((v) => v.impact === 'serious');
    await testInfo.attach(`axe-serious-${path}`, {
      body: JSON.stringify(serious, null, 2),
      contentType: 'application/json',
    });
  });
}

