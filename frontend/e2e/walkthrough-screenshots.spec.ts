import { test, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Captures the PNGs that back the walkthrough docs.
// Runs against the demo build (VITE_DEMO=1) so no backend is required.
// Set WALKTHROUGH_SHOTS=1 to opt in; the default suite (demo.spec.ts) skips it.
//
// WALKTHROUGH_LANG selects the UI language (`fr` default; `en` supported).
// Output goes to website/static/img/walkthroughs/<lang>/ — the shared,
// bilingual asset tree referenced by both the default-locale docs and the
// i18n/fr mirror.

const SHOULD_RUN = process.env.WALKTHROUGH_SHOTS === '1';
// Real-backend mode: WALKTHROUGH_LOCAL_URL points playwright.config's
// baseURL at a running Hoopoe instance instead of the demo build. When set,
// we also need to log in as the demo user first (WALKTHROUGH_LOCAL_USER /
// WALKTHROUGH_LOCAL_PASS). Credentials are read at run time only — never
// committed.
const LOCAL_MODE = process.env.WALKTHROUGH_LOCAL_URL !== undefined && process.env.WALKTHROUGH_LOCAL_URL !== '';

const RAW_LANG = (process.env.WALKTHROUGH_LANG ?? 'fr').toLowerCase();
const LANG: 'fr' | 'en' = RAW_LANG === 'en' ? 'en' : 'fr';
const PLAYWRIGHT_LOCALE = LANG === 'en' ? 'en-US' : 'fr-FR';

const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'website',
  'static',
  'img',
  'walkthroughs',
  LANG,
);

async function dismissWelcomeTour(page: Page): Promise<void> {
  // The TourBubble is a role="dialog" with the step title as its accessible
  // name (e.g. "Solde global"), not a fixed brand label. Match the Skip
  // button it always exposes instead. .first() guards against strict-mode
  // when any other "Passer" / "Skip" ever lives on the page.
  //
  // Wait up to 5 s for Skip to appear — the dashboard tour only auto-starts
  // after the balance query resolves, which can land several hundred ms
  // after networkidle. Click and confirm it stays hidden for 200 ms (long
  // enough for the demo adapter's dismiss POST to flush) before returning.
  // No tour at all — the normal case for pages whose tip id is already in
  // the dismissed map — returns in ~5 s.
  const skip = page.getByRole('button', { name: /^Passer$|^Skip$/i }).first();
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
    await skip.click({ force: true });
    await skip.waitFor({ state: 'hidden', timeout: 3_000 });
    await page.waitForTimeout(200);
  } catch {
    /* no tour, or dismiss raced it — subsequent gotoAndSettle retries */
  }
  // One more cheap check in case the tour appeared during the dismiss POST
  // (common on view-reports where the dashboard is the only page visited).
  try {
    await skip.waitFor({ state: 'visible', timeout: 1_000 });
    await skip.click({ force: true });
    await skip.waitFor({ state: 'hidden', timeout: 2_000 });
    await page.waitForTimeout(150);
  } catch {
    /* ok */
  }
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
}

// The demo build mounts a HashRouter (see frontend/src/main.tsx) so every
// in-app route lives behind `#/…`. A bare page.goto('/transactions') lands
// at '/' with no hash, so React Router shows the dashboard — the reason
// every non-dashboard shot used to come out as the dashboard. In LOCAL_MODE
// the real app uses BrowserRouter, so paths stay plain.
function routePath(path: string): string {
  if (LOCAL_MODE) return path;
  return path === '/' ? '/#/' : `/#${path}`;
}

async function waitForBoot(page: Page): Promise<void> {
  // The real backend keeps a service-worker / long-poll connection warm, so
  // `networkidle` never fires in LOCAL_MODE; `domcontentloaded` is enough
  // there since the sidebar wait below is the real readiness gate.
  await page.waitForLoadState(LOCAL_MODE ? 'domcontentloaded' : 'networkidle');
  // The sidebar only renders inside <Layout>, which is gated on `user`.
  // Its appearance signals /api/auth/me resolved and we are past the
  // null-user redirect that otherwise bounces the hash back to '/'.
  await page.getByRole('link', { name: /Dashboard/i }).first().waitFor({
    state: 'visible',
    timeout: 10_000,
  });
}

async function gotoAndSettle(page: Page, path: string): Promise<void> {
  await page.goto(routePath(path));
  await waitForBoot(page);
  await dismissWelcomeTour(page);
  await page.waitForTimeout(300);
}

test.describe('walkthrough screenshots', () => {
  test.skip(!SHOULD_RUN, 'set WALKTHROUGH_SHOTS=1 to regenerate walkthrough PNGs');

  // The real backend takes noticeably longer than the demo build (each
  // gotoAndSettle waits ~5 s for the tour that never shows up), so the EN
  // suite was already hitting 28 s / test and the FR suite went over.
  test.describe.configure({ timeout: 90_000 });

  test.use({ locale: PLAYWRIGHT_LOCALE });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Force i18next to the requested language — it persists in localStorage.
    await page.addInitScript((lang) => {
      try { localStorage.setItem('i18nextLng', lang); } catch { /* noop */ }
    }, LANG);
    // In demo mode api() is routed to an in-browser adapter, not window.fetch,
    // so page.route() cannot intercept tip requests. We instead click Skip on
    // each page's auto-start tour via gotoAndSettle() below; each dismiss POST
    // persists in the demo's per-context Map and keeps repeat visits quiet.
    if (LOCAL_MODE) {
      const user = process.env.WALKTHROUGH_LOCAL_USER;
      const pass = process.env.WALKTHROUGH_LOCAL_PASS;
      if (!user || !pass) {
        throw new Error('WALKTHROUGH_LOCAL_URL is set but WALKTHROUGH_LOCAL_USER / WALKTHROUGH_LOCAL_PASS are missing.');
      }
      await page.goto('/login');
      await page.locator('input[autocomplete="username"]').fill(user);
      await page.locator('input[type="password"]').fill(pass);
      await page.getByRole('button', { name: /Se connecter|Sign in/i }).click();
      // Login mutation navigates to '/' on success — wait for it explicitly
      // so downstream page.goto() calls don't race the auth redirect.
      await page.waitForURL('**/', { timeout: 10_000 });
      await dismissWelcomeTour(page);
    }
  });

  test('import-a-statement', async ({ page }) => {
    await gotoAndSettle(page, '/');

    await gotoAndSettle(page, '/data/imports');
    await shot(page, 'import-01-imports-page');

    await gotoAndSettle(page, '/data/duplicates');
    await shot(page, 'import-02-doublons');

    await gotoAndSettle(page, '/accounts');
    await shot(page, 'import-03-comptes-solde');

    // Expand the checkpoints panel on the first account card so the drawer
    // (year accordion + add-form) is visible for the walkthrough shot.
    const firstToggle = page.getByRole('button', { name: /Points de contrôle|Balance checkpoints|Checkpoints/i }).first();
    await firstToggle.click();
    await page.waitForTimeout(400);
    await shot(page, 'import-04-checkpoints');
  });

  test('categorise-transactions', async ({ page }) => {
    await gotoAndSettle(page, '/');

    await gotoAndSettle(page, '/transactions');
    await shot(page, 'categorise-01-transactions');

    await gotoAndSettle(page, '/rules/sort');
    await shot(page, 'categorise-02-tri');

    await gotoAndSettle(page, '/rules/list');
    await shot(page, 'categorise-03-regles-liste');
  });

  test('set-a-budget', async ({ page }) => {
    await gotoAndSettle(page, '/');

    await gotoAndSettle(page, '/budgets/caps');
    await shot(page, 'budget-01-plafonds');

    await gotoAndSettle(page, '/budgets/envelopes');
    await shot(page, 'budget-02-enveloppes');

    await gotoAndSettle(page, '/');
    await shot(page, 'budget-03-dashboard-progress');
  });

  test('view-reports', async ({ page }) => {
    await gotoAndSettle(page, '/');
    await shot(page, 'reports-01-dashboard');

    // Scroll to reveal charts further down the dashboard.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(500);
    await shot(page, 'reports-02-dashboard-mid');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await shot(page, 'reports-03-dashboard-bottom');

    // Balance curve section (Trend / Évolution) — captured last because the
    // interactions below (single-account scope + widest range) are shared
    // page state that would otherwise leak into the donut and Sankey shots.
    //
    // Diamond markers only render when a specific account is picked
    // (chartCheckpoints returns undefined for chartScope === 'all', see
    // Dashboard/index.tsx), and the default 3-month range predates the
    // demo seed's oldest checkpoint. Pick the first account and set the
    // range to All / Tout so every diamond appears on the curve.
    //
    // The scope controls live in the shared ChartScopeBar above the three
    // chart sections, not inside the Evolution section itself.
    const scopeBar = page.getByRole('group', {
      name: /Charts scope|Portée des graphiques/i,
    });
    // See waitForBoot() — real backend never reaches networkidle, so fall
    // back to a short settle for LOCAL_MODE after each scope control change.
    const settle = async () => {
      if (LOCAL_MODE) await page.waitForTimeout(400);
      else await page.waitForLoadState('networkidle');
    };
    await scopeBar.locator('select').selectOption({ index: 1 });
    await settle();
    await scopeBar.getByRole('button', { name: /^All$|^Tout$/i }).click();
    await settle();
    const balanceSection = page.locator('#dash-evolution');
    await balanceSection.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);
    await shot(page, 'reports-04-balance-curve');
  });
});
