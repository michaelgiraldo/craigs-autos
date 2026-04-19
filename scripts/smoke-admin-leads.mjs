import { chromium } from 'playwright';

const adminPassword = process.env.LEADS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '';
const adminUrl = process.env.ADMIN_LEADS_URL || 'https://craigs.autos/admin/leads/';
const smokeRowText = process.env.ADMIN_SMOKE_ROW_TEXT || '';
const shouldExerciseQualification = process.env.ADMIN_SMOKE_QUALIFY === 'true';

if (!adminPassword) {
  console.error(
    'Missing admin password. Set LEADS_ADMIN_PASSWORD or ADMIN_PASSWORD before running smoke:admin-leads.',
  );
  process.exit(1);
}

if (shouldExerciseQualification && !smokeRowText) {
  console.error('ADMIN_SMOKE_QUALIFY=true requires ADMIN_SMOKE_ROW_TEXT.');
  process.exit(1);
}

const result = {
  page: adminUrl,
  loginVisibleBefore: false,
  dashboardVisibleAfterLogin: false,
  chatWidgetCount: 0,
  stickyCtaCount: 0,
  publicShellCount: 0,
  adminShellCount: 0,
  smokeRowVisible: false,
  qualificationPostStatuses: [],
  adminGetStatuses: [],
};

function isAdminLeadsResponse(response) {
  try {
    const url = new URL(response.url());
    return url.pathname === '/admin/leads' || url.pathname === '/admin/leads/';
  } catch {
    return false;
  }
}

function isAdminQualificationResponse(response) {
  try {
    const url = new URL(response.url());
    return url.pathname === '/admin/leads/qualification';
  } catch {
    return false;
  }
}

async function clickAndWaitForQualification(page, rowText, buttonName) {
  const row = page.locator('tr', { hasText: rowText }).first();
  const button = row.getByRole('button', { name: buttonName });
  await button.waitFor({ timeout: 15_000 });
  await button.scrollIntoViewIfNeeded();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        isAdminQualificationResponse(response) &&
        response.request().method() === 'POST' &&
        response.status() === 200,
      { timeout: 30_000 },
    ),
    button.click(),
  ]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on('response', (response) => {
    if (!isAdminLeadsResponse(response) && !isAdminQualificationResponse(response)) return;

    const entry = {
      method: response.request().method(),
      status: response.status(),
    };

    if (entry.method === 'GET') result.adminGetStatuses.push(entry);
    if (entry.method === 'POST') result.qualificationPostStatuses.push(entry);
  });

  try {
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    result.chatWidgetCount = await page.locator('.chat-widget, openai-chatkit').count();
    result.stickyCtaCount = await page.locator('.sticky-cta').count();
    result.publicShellCount = await page
      .locator('.site-header, .site-footer, .site-nav, .site-menu__overlay, .lang-switcher')
      .count();
    result.adminShellCount = await page.locator('.admin-shell').count();

    const passwordInput = page.getByPlaceholder('Admin password');
    result.loginVisibleBefore = await passwordInput.isVisible({ timeout: 10_000 });
    await passwordInput.fill(adminPassword);

    await Promise.all([
      page.waitForResponse(
        (response) =>
          isAdminLeadsResponse(response) &&
          response.request().method() === 'GET' &&
          response.status() === 200,
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ]);

    await page.getByRole('heading', { name: 'Lead Records' }).waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Log out' }).waitFor({ timeout: 15_000 });
    result.dashboardVisibleAfterLogin = true;

    if (smokeRowText) {
      const row = page.locator('tr', { hasText: smokeRowText }).first();
      await row.waitFor({ timeout: 15_000 });
      result.smokeRowVisible = true;

      if (shouldExerciseQualification) {
        const startsUnqualified = (await row.getByRole('button', { name: 'Qualify' }).count()) > 0;
        const firstButton = startsUnqualified ? 'Qualify' : 'Unqualify';
        const secondButton = startsUnqualified ? 'Unqualify' : 'Qualify';

        await clickAndWaitForQualification(page, smokeRowText, firstButton);
        await clickAndWaitForQualification(page, smokeRowText, secondButton);
      }
    }
  } finally {
    await browser.close();
  }

  const failures = [];
  if (!result.loginVisibleBefore) failures.push('Admin password input was not visible.');
  if (!result.dashboardVisibleAfterLogin) failures.push('Admin dashboard did not load.');
  if (result.adminShellCount !== 1) failures.push('Admin shell was not present exactly once.');
  if (result.chatWidgetCount > 0) failures.push('Chat widget was present on admin page.');
  if (result.stickyCtaCount > 0) failures.push('Sticky CTA was present on admin page.');
  if (result.publicShellCount > 0)
    failures.push('Public marketing shell was present on admin page.');
  if (smokeRowText && !result.smokeRowVisible) failures.push('Smoke row was not visible.');
  if (shouldExerciseQualification && result.qualificationPostStatuses.length < 2) {
    failures.push('Qualification smoke did not complete both POST requests.');
  }

  console.log(JSON.stringify({ ok: failures.length === 0, failures, ...result }, null, 2));

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...result,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
