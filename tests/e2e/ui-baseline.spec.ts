/**
 * Design-audit evidence capture (read-only). Signs in as each demo role and,
 * for every key route x viewport, records:
 *   - a full-page screenshot
 *   - horizontal overflow (document wider than the viewport) + offending elements
 *   - console errors
 *   - an axe-core WCAG 2.x A/AA scan (at one mobile and one desktop width)
 *   - what receives focus on the first Tab press (skip-link check)
 *
 * It never clicks submit / save / assign — nothing is written to the DB.
 * Skipped unless AUDIT_PHASE is set, so the normal e2e run is unaffected:
 *   AUDIT_PHASE=before npx playwright test ui-baseline
 * Output: design-audit/evidence/<phase>/{screens/*.png, results-<role>.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, DEMO_USERS } from './helpers/auth';

const PHASE = process.env.AUDIT_PHASE;
const OUT = path.join(process.cwd(), 'design-audit', 'evidence', PHASE ?? 'none');
const SCREENS = path.join(OUT, 'screens');

const VIEWPORTS = [
  { name: 'narrow-360', width: 360, height: 780 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'wide-1536', width: 1536, height: 864 },
] as const;
const AXE_VIEWPORTS = new Set(['mobile-390', 'laptop-1280']);

type RouteResult = {
  route: string;
  viewport: string;
  status: 'ok' | 'error';
  finalUrl?: string;
  overflowPx?: number;
  overflowing?: string[];
  consoleErrors?: string[];
  firstTabFocus?: string;
  axe?: { id: string; impact: string | null; nodes: number; help: string; targets: string[] }[];
  error?: string;
};

test.skip(!PHASE, 'Set AUDIT_PHASE=before|after to capture design-audit evidence');
test.describe.configure({ mode: 'serial' });

function slug(s: string) {
  return s.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'root';
}

async function firstHref(page: Page, url: string, pattern: RegExp): Promise<string | null> {
  await page.goto(url);
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.find((h) => pattern.test(h)) ?? null;
}

async function capture(page: Page, role: string, routes: string[]): Promise<RouteResult[]> {
  fs.mkdirSync(SCREENS, { recursive: true });
  const results: RouteResult[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`));

  for (const route of routes) {
    for (const vp of VIEWPORTS) {
      consoleErrors.length = 0;
      const r: RouteResult = { route, viewport: vp.name, status: 'ok' };
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route, { waitUntil: 'load' });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        r.finalUrl = new URL(page.url()).pathname;

        const overflow = await page.evaluate(() => {
          const vw = window.innerWidth;
          const over = document.documentElement.scrollWidth - vw;
          const offenders: string[] = [];
          if (over > 0) {
            for (const el of Array.from(document.body.querySelectorAll('*'))) {
              const rect = el.getBoundingClientRect();
              if (rect.right > vw + 1 && rect.width > 0) {
                const cls = (el.getAttribute('class') ?? '').split(' ').slice(0, 4).join('.');
                offenders.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} (right=${Math.round(rect.right)})`);
                if (offenders.length >= 5) break;
              }
            }
          }
          return { over, offenders };
        });
        r.overflowPx = Math.max(0, overflow.over);
        r.overflowing = overflow.offenders;

        await page.screenshot({
          path: path.join(SCREENS, `${role}__${slug(route)}__${vp.name}.png`),
          fullPage: true,
        });

        if (AXE_VIEWPORTS.has(vp.name)) {
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          r.axe = axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact ?? null,
            nodes: v.nodes.length,
            help: v.help,
            targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
          }));

          // Fresh load so the sequential-focus start point is the top of the document.
          await page.goto(route, { waitUntil: 'load' });
          await page.keyboard.press('Tab');
          r.firstTabFocus = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return 'body';
            const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
            return `${el.tagName.toLowerCase()}${el.getAttribute('href') ? `[href=${el.getAttribute('href')}]` : ''} "${name}"`;
          });
        }
      } catch (e) {
        r.status = 'error';
        r.error = (e as Error).message.slice(0, 300);
      }
      r.consoleErrors = [...consoleErrors];
      results.push(r);
    }
  }
  fs.writeFileSync(path.join(OUT, `results-${role}.json`), JSON.stringify(results, null, 2));
  return results;
}

test('anonymous: sign-in', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await capture(page, 'anonymous', ['/sign-in']);
});

test('participant routes', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await signIn(page, DEMO_USERS.participant1);
  await capture(page, 'participant', ['/overview', '/my-ideas', '/submit', '/notifications']);
});

/**
 * R-06 / R-04 checks on the submit form. Read-only: "Submit idea" on an empty
 * form only runs client-side validation; the confirm dialog must not open.
 */
test('participant submit form: validation summary and mobile action bar', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });
  await signIn(page, DEMO_USERS.participant1);
  const result: Record<string, unknown> = {};

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/submit');
  await page.getByRole('button', { name: 'Submit idea' }).click();
  await page.waitForTimeout(300);
  const summary = page.getByRole('alert').filter({ hasText: 'to submit your idea' });
  result.summaryVisible = await summary.isVisible().catch(() => false);
  result.summaryLinks = await summary.getByRole('link').count().catch(() => 0);
  result.summaryFocused = await page.evaluate(() => !!document.activeElement?.textContent?.includes('to submit your idea'));
  result.invalidFields = await page.locator('[aria-invalid="true"]').count();
  result.dialogOpened = await page.getByRole('alertdialog').isVisible().catch(() => false);
  await page.screenshot({ path: path.join(SCREENS, 'participant__submit-validation__laptop-1280.png'), fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/submit');
  await page.getByRole('heading', { name: 'Your idea' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  result.mobileActionBar = await page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('div.sticky')).find((d) => d.textContent?.includes('Save draft'));
    const nav = document.querySelector('nav.fixed');
    if (!bar || !nav) return { error: 'bar or nav not found' };
    const b = bar.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    const submit = Array.from(bar.querySelectorAll('button')).find((x) => x.textContent?.includes('Submit idea'));
    const s = submit?.getBoundingClientRect();
    const hit = s ? document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2) : null;
    return {
      barBottom: Math.round(b.bottom),
      navTop: Math.round(n.top),
      overlaps: b.bottom > n.top + 1,
      submitHitIsSubmit: !!hit && !!submit && submit.contains(hit),
    };
  });
  await page.screenshot({ path: path.join(SCREENS, 'participant__submit-scrolled__mobile-375.png') });
  fs.writeFileSync(path.join(OUT, 'results-submit-form.json'), JSON.stringify(result, null, 2));
});

test('participant dark mode', async ({ page }) => {
  test.setTimeout(3 * 60_000);
  fs.mkdirSync(SCREENS, { recursive: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, DEMO_USERS.participant1);
  const out: Record<string, unknown> = {};
  for (const [route, vp] of [['/overview', 390], ['/overview', 1280], ['/submit', 1280]] as const) {
    await page.setViewportSize({ width: vp, height: 844 });
    await page.goto(route);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    out[`${route}@${vp}`] = {
      theme: await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      axe: axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })),
    };
    await page.screenshot({ path: path.join(SCREENS, `participant__${slug(route)}-dark__${vp}.png`), fullPage: true });
  }
  fs.writeFileSync(path.join(OUT, 'results-dark.json'), JSON.stringify(out, null, 2));
});

test('mentor routes', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await signIn(page, DEMO_USERS.mentorHighCapacity);
  const review = await firstHref(page, '/reviews', /^\/reviews\/[^/?]+$/);
  await capture(page, 'mentor', ['/overview', '/dashboard', '/reviews', ...(review ? [review] : [])]);
});

test('admin routes', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await signIn(page, DEMO_USERS.admin);
  const idea = await firstHref(page, '/ideas', /^\/ideas\/[^/?]+$/);
  await capture(page, 'admin', [
    '/overview',
    '/ideas',
    ...(idea ? [idea] : []),
    '/review-assignment',
    '/screening',
    '/project-mentor',
    '/roles',
  ]);
});
