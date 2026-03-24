import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output', 'playwright');

const DEFAULT_TIMEOUT_MS = 60_000;
const LOCALE_PATHS = ['en', 'es', 'zh-hans', 'ar'];
const ALLOWED_PAGE_ERRORS = [
  /chunk-LEX3GG7N\.js/i,
  /Cannot read properties of undefined \(reading 'map'\)/i,
];

const CHATKIT_RUNTIME_ERROR_PATTERNS = [
  /chatgpt\.com\/ces\/v1\/projects\/oai\/settings/i,
  /blocked by CORS policy/i,
  /^Failed to load resource: net::ERR_FAILED$/i,
  /^Failed to fetch$/i,
];

function stripAnsi(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 27 && value[index + 1] === '[') {
      index += 2;
      while (index < value.length) {
        const char = value[index];
        if ((char >= '0' && char <= '9') || char === ';') {
          index += 1;
          continue;
        }
        if (char === 'm') {
          break;
        }
        index -= 1;
        break;
      }
      continue;
    }
    output += value[index];
  }
  return output;
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    headed: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') {
      options.baseUrl = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === '--headed') {
      options.headed = true;
      continue;
    }
    if (arg === '--timeout') {
      const seconds = Number.parseInt(argv[i + 1] ?? '', 10);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error(`Invalid --timeout value: ${argv[i + 1] ?? ''}`);
      }
      options.timeoutMs = seconds * 1000;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function logStep(label, detail) {
  process.stdout.write(`${label}: ${detail}\n`);
}

function ensureLocalChatkitEnv() {
  const hasProcessEnv = Boolean(process.env.OPENAI_API_KEY && process.env.CHATKIT_WORKFLOW_ID);
  if (hasProcessEnv) return;

  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      'Local smoke mode requires OPENAI_API_KEY and CHATKIT_WORKFLOW_ID in process env or .env.local.',
    );
  }

  const envText = fs.readFileSync(envPath, 'utf8');
  const hasApiKey = /^OPENAI_API_KEY=.+$/m.test(envText);
  const hasWorkflow = /^CHATKIT_WORKFLOW_ID=.+$/m.test(envText);
  if (!hasApiKey || !hasWorkflow) {
    throw new Error(
      'Local smoke mode requires OPENAI_API_KEY and CHATKIT_WORKFLOW_ID in .env.local.',
    );
  }
}

function createLineReader(onLine) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      onLine(stripAnsi(line));
    }
  };
}

async function startLocalStack(timeoutMs) {
  ensureLocalChatkitEnv();

  const child = spawn('npm', ['run', 'dev:local'], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const recentLines = [];
  let baseUrl = null;
  let apiReady = false;

  const onLine = (line) => {
    if (!line.trim()) return;
    recentLines.push(line);
    if (recentLines.length > 80) {
      recentLines.shift();
    }
    if (line.includes('ChatKit dev API listening on http://localhost:8787')) {
      apiReady = true;
    }
    const match = line.match(/Local\s+http:\/\/localhost:(\d+)\//);
    if (match) {
      baseUrl = `http://localhost:${match[1]}`;
    }
  };

  const readStdout = createLineReader(onLine);
  const readStderr = createLineReader(onLine);
  child.stdout.on('data', (chunk) => readStdout(String(chunk)));
  child.stderr.on('data', (chunk) => readStderr(String(chunk)));

  try {
    const ready = Promise.withResolvers();
    const timeoutId = setTimeout(() => {
      ready.reject(
        new Error(
          `Timed out waiting for local ChatKit dev stack.\nRecent output:\n${recentLines.join('\n')}`,
        ),
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeoutId);
      child.off('exit', handleExit);
      child.stdout.off('data', checkReady);
      child.stderr.off('data', checkReady);
    };

    const checkReady = () => {
      if (baseUrl && apiReady) {
        cleanup();
        ready.resolve(baseUrl);
      }
    };

    const handleExit = (code) => {
      cleanup();
      ready.reject(
        new Error(
          `Local ChatKit dev stack exited early with code ${code ?? 'unknown'}.\nRecent output:\n${recentLines.join('\n')}`,
        ),
      );
    };

    child.on('exit', handleExit);
    child.stdout.on('data', checkReady);
    child.stderr.on('data', checkReady);

    const readyBaseUrl = await ready.promise;

    return {
      baseUrl: readyBaseUrl,
      recentLines,
      async stop() {
        if (child.killed) return;
        child.kill('SIGINT');
        await Promise.race([
          new Promise((resolve) => child.once('exit', resolve)),
          delay(5_000).then(() => {
            child.kill('SIGTERM');
          }),
        ]);
      },
    };
  } catch (error) {
    child.kill('SIGINT');
    throw error;
  }
}

function isAllowedPageError(message) {
  return ALLOWED_PAGE_ERRORS.some((pattern) => pattern.test(message));
}

function isAllowedConsoleError(message, locationUrl) {
  if (isAllowedPageError(message)) {
    return true;
  }
  if (locationUrl.includes('https://chatgpt.com/ces/v1/projects/oai/settings')) {
    return true;
  }
  if (!locationUrl.includes('cdn.platform.openai.com')) {
    return false;
  }
  return CHATKIT_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

async function createInstrumentedPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const issues = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const locationUrl = message.location()?.url ?? '';
    if (isAllowedConsoleError(text, locationUrl)) return;
    issues.push(`console error: ${text}${locationUrl ? ` (${locationUrl})` : ''}`);
  });

  page.on('pageerror', (error) => {
    if (isAllowedPageError(error.message)) return;
    issues.push(`page error: ${error.message}`);
  });

  return {
    context,
    page,
    assertClean(label) {
      if (issues.length > 0) {
        throw new Error(`${label} saw unexpected browser errors:\n${issues.join('\n')}`);
      }
    },
  };
}

async function waitForChatFrame(page, timeoutMs) {
  await page.locator('iframe[name="chatkit"]').waitFor({ state: 'visible', timeout: timeoutMs });
  const frame = page.frameLocator('iframe[name="chatkit"]');
  await frame.locator('main').waitFor({ timeout: timeoutMs });
  return frame;
}

async function checkLocales(browser, baseUrl, timeoutMs) {
  const { context, page, assertClean } = await createInstrumentedPage(browser);
  try {
    for (const locale of LOCALE_PATHS) {
      const url = `${baseUrl}/${locale}/`;
      logStep('Locale', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const htmlLang = (await page.locator('html').getAttribute('lang')) ?? '';
      if (htmlLang.toLowerCase() !== locale) {
        throw new Error(`Expected html[lang="${locale}"] at ${url}, got "${htmlLang}".`);
      }
      await waitForChatFrame(page, timeoutMs);
    }
    assertClean('Locale smoke');
  } finally {
    await context.close();
  }
}

async function checkChatFlow(browser, baseUrl, timeoutMs) {
  const { context, page, assertClean } = await createInstrumentedPage(browser);
  try {
    const sessionResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/chatkit/session/') && response.request().method() === 'POST',
      { timeout: timeoutMs },
    );

    await page.goto(`${baseUrl}/en/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const response = await sessionResponse;
    if (response.status() !== 200) {
      throw new Error(`Expected /api/chatkit/session/ to return 200, got ${response.status()}.`);
    }

    const frame = await waitForChatFrame(page, timeoutMs);
    await frame.getByRole('button', { name: /^Seat$/i }).click({ timeout: timeoutMs });
    await frame.getByRole('heading', { name: 'You said:' }).waitFor({ timeout: timeoutMs });
    await frame.getByRole('heading', { name: 'The assistant said:' }).waitFor({
      timeout: timeoutMs,
    });

    assertClean('Chat flow smoke');
  } finally {
    await context.close();
  }
}

async function checkAttribution(browser, baseUrl, timeoutMs) {
  const { context, page, assertClean } = await createInstrumentedPage(browser);
  try {
    const url = `${baseUrl}/en/?gclid=smoke-gclid&utm_source=google&utm_medium=cpc&utm_campaign=chatkit-smoke`;
    logStep('Attribution', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await waitForChatFrame(page, timeoutMs);
    await delay(1_000);

    const landingState = await page.evaluate(() => ({
      attribution: window.localStorage.getItem('craigs_attribution_v1'),
      cookie: document.cookie,
      dataLayerTail: Array.isArray(window.dataLayer) ? window.dataLayer.slice(-3) : [],
    }));

    const attribution = landingState.attribution ? JSON.parse(landingState.attribution) : null;
    if (attribution?.last_touch?.gclid !== 'smoke-gclid') {
      throw new Error('Attribution smoke test did not persist the expected gclid.');
    }
    if (!landingState.cookie.includes('gclid=smoke-gclid')) {
      throw new Error('Attribution smoke test did not persist the gclid cookie.');
    }

    const clickEvents = await page.evaluate(() => {
      const before = Array.isArray(window.dataLayer) ? window.dataLayer.length : 0;
      const link = document.querySelector('a[href^="tel:"]');
      if (!(link instanceof HTMLAnchorElement)) {
        return [];
      }
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return Array.isArray(window.dataLayer) ? window.dataLayer.slice(before) : [];
    });

    const callEvent = clickEvents.find((entry) => entry?.event === 'lead_click_to_call');
    if (!callEvent) {
      throw new Error('Click-to-call smoke test did not push lead_click_to_call to the dataLayer.');
    }
    if (callEvent.lead_intent_type !== 'call') {
      throw new Error('Click-to-call smoke test did not include lead_intent_type=call.');
    }
    if (callEvent.source_platform !== 'google_ads') {
      throw new Error('Click-to-call smoke test did not infer source_platform=google_ads.');
    }
    if (callEvent.click_id_type !== 'gclid') {
      throw new Error('Click-to-call smoke test did not infer click_id_type=gclid.');
    }

    assertClean('Attribution smoke');
  } finally {
    await context.close();
  }
}

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

async function warmLocalDevServer(browser, baseUrl, timeoutMs) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/en/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await delay(2_000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await delay(1_000);
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: !options.headed });
  let localStack = null;

  try {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    if (baseUrl) {
      logStep('Base URL', baseUrl);
    } else {
      logStep('Base URL', 'starting local ChatKit dev stack');
      localStack = await startLocalStack(options.timeoutMs);
      options.baseUrl = localStack.baseUrl;
      logStep('Base URL', options.baseUrl);
      logStep('Warm-up', 'stabilizing Astro/Vite dev dependencies');
      await warmLocalDevServer(browser, options.baseUrl, options.timeoutMs);
    }

    await checkLocales(browser, options.baseUrl, options.timeoutMs);
    await checkChatFlow(browser, options.baseUrl, options.timeoutMs);
    await checkAttribution(browser, options.baseUrl, options.timeoutMs);
    logStep('Smoke', 'passed');
  } catch (error) {
    await ensureOutputDir();
    try {
      const page = await browser.newPage();
      await page.screenshot({
        path: path.join(OUTPUT_DIR, 'chatkit-smoke-failure.png'),
        fullPage: true,
      });
      await page.close();
    } catch {
      // Ignore screenshot failures.
    }

    if (
      error instanceof Error &&
      /Executable doesn't exist|browserType\.launch/i.test(error.message)
    ) {
      console.error('Playwright browser is not installed. Run: npx playwright install chromium');
    }
    throw error;
  } finally {
    if (localStack) {
      await localStack.stop();
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
