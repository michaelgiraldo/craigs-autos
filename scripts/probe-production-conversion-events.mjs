import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';

const DEFAULT_BASE_URL = 'https://craigs.autos';
const DEFAULT_TIMEOUT_MS = 120_000;
const EXPECTED_GTM_ID = 'GTM-WQJLM7R6';
const EXPECTED_GA4_ID = 'G-0JLX2NGBTV';

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

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    flow: 'all',
    headed: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url' || arg === '--base-url') {
      options.baseUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--flow') {
      options.flow = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--headed') {
      options.headed = true;
      continue;
    }
    if (arg === '--timeout') {
      const seconds = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error(`Invalid --timeout value: ${argv[index + 1] ?? ''}`);
      }
      options.timeoutMs = seconds * 1000;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!/^https?:\/\//i.test(options.baseUrl)) {
    throw new Error(
      `Expected --base-url to be an absolute http(s) URL. Received: ${options.baseUrl}`,
    );
  }

  if (!['all', 'quote-form', 'chat', 'chat-passive'].includes(options.flow)) {
    throw new Error(
      `Expected --flow to be one of: all, quote-form, chat, chat-passive. Received: ${options.flow}`,
    );
  }

  return options;
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value || DEFAULT_BASE_URL);
  return parsed.origin;
}

function withProbeQuery(url, label) {
  const parsed = new URL(url);
  parsed.searchParams.set('codex_probe', `${label}_${Date.now()}`);
  return parsed.toString();
}

function isTrackedRequest(url) {
  const parsed = new URL(url);
  return (
    parsed.hostname === 'www.googletagmanager.com' ||
    parsed.hostname.endsWith('google-analytics.com') ||
    parsed.hostname.endsWith('google.com') ||
    parsed.pathname.endsWith('/lead-interactions') ||
    parsed.pathname.endsWith('/lead-interactions/')
  );
}

function summarizeRequest(request) {
  const url = request.url();
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!isTrackedRequest(url)) return null;

  const eventName =
    parsed.searchParams.get('en') ??
    parsed.searchParams.get('event') ??
    parsed.searchParams.get('event_name');
  const body = request.postData();

  let bodyEvent = null;
  if (body) {
    try {
      const parsedBody = JSON.parse(body);
      bodyEvent = typeof parsedBody.event === 'string' ? parsedBody.event : null;
    } catch {
      bodyEvent = null;
    }
  }

  return {
    method: request.method(),
    host: parsed.hostname,
    path: parsed.pathname,
    id: parsed.searchParams.get('id') ?? parsed.searchParams.get('tid') ?? null,
    eventName,
    bodyEvent,
    url,
  };
}

function installProbeScript({ mockFetch = true, mockLeadInteractions = false } = {}) {
  return `(() => {
    try {
      if (window.top !== window) return;
    } catch {
      return;
    }

    const shouldMockFetch = ${JSON.stringify(mockFetch)};
    const shouldMockLeadInteractions = ${JSON.stringify(mockLeadInteractions)};
    const probe = {
      dataLayer: [],
      fetch: [],
      mocked: [],
      sendBeacon: [],
    };

    const clone = (value) => {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return { unserializable: true };
      }
    };

    const normalizeUrl = (value) => {
      try {
        return new URL(String(value), window.location.href);
      } catch {
        return null;
      }
    };

    const isRoute = (url, route) => {
      const parsed = normalizeUrl(url);
      if (!parsed) return false;
      return (
        parsed.pathname.endsWith('/' + route) || parsed.pathname.endsWith('/' + route + '/')
      );
    };

    const isPostTo = (url, method, route) => method.toUpperCase() === 'POST' && isRoute(url, route);

    const patchDataLayer = (value) => {
      const next = Array.isArray(value) ? value : [];
      if (next.__craigsProbePatched) return next;
      const originalPush = next.push.bind(next);
      Object.defineProperty(next, '__craigsProbePatched', { value: true });
      next.push = (...items) => {
        for (const item of items) {
          probe.dataLayer.push(clone(item));
        }
        return originalPush(...items);
      };
      return next;
    };

    let dataLayer = patchDataLayer(window.dataLayer || []);
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      get() {
        return dataLayer;
      },
      set(value) {
        dataLayer = patchDataLayer(value);
      },
    });

    if (typeof navigator.sendBeacon === 'function') {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        probe.sendBeacon.push({ url: String(url), data: typeof data === 'string' ? data : null });
        if (shouldMockLeadInteractions && isRoute(url, 'lead-interactions')) {
          probe.mocked.push({ route: 'lead-interactions', url: String(url) });
          return true;
        }
        return originalSendBeacon(url, data);
      };
    }

    if (shouldMockFetch && typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const request = input instanceof Request ? input : null;
        const url = typeof input === 'string' ? input : request ? request.url : String(input);
        const method = init.method || request?.method || 'GET';
        const body = typeof init.body === 'string' ? init.body : null;
        probe.fetch.push({ url, method, body });

        if (isPostTo(url, method, 'quote-requests')) {
          probe.mocked.push({ route: 'quote-requests', url });
          return new Response(
            JSON.stringify({ ok: true, lead_record_id: 'probe_lead_record' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (isPostTo(url, method, 'chat-handoffs')) {
          probe.mocked.push({ route: 'chat-handoffs', url });
          return new Response(
            JSON.stringify({ ok: true, status: 'accepted', reason: 'codex_probe' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (shouldMockLeadInteractions && isPostTo(url, method, 'lead-interactions')) {
          probe.mocked.push({ route: 'lead-interactions', url });
          return new Response(null, { status: 204 });
        }

        return originalFetch(input, init);
      };
    }

    window.__craigsLeadEventProbe = probe;
  })();`;
}

function isAllowedPageError(message) {
  return ALLOWED_PAGE_ERRORS.some((pattern) => pattern.test(message));
}

function isAllowedConsoleError(message, locationUrl) {
  if (isAllowedPageError(message)) return true;
  if (locationUrl.includes('https://chatgpt.com/ces/v1/projects/oai/settings')) return true;
  if (!locationUrl.includes('cdn.platform.openai.com')) return false;
  return CHATKIT_RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

async function createProbePage(
  browser,
  { installInitScript = true, mockFetch = true, mockLeadInteractions = false } = {},
) {
  const requests = [];
  const issues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  if (installInitScript) {
    await context.addInitScript({
      content: installProbeScript({ mockFetch, mockLeadInteractions }),
    });
  }
  const page = await context.newPage();

  page.on('request', (request) => {
    const summary = summarizeRequest(request);
    if (summary) requests.push(summary);
  });
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

  return { context, issues, page, requests };
}

async function installChatHandoffMock(page) {
  await page.evaluate(() => {
    if (window.__craigsChatHandoffMockInstalled) return;
    window.__craigsChatHandoffMockInstalled = true;
    window.__craigsLeadEventProbe = window.__craigsLeadEventProbe || {
      dataLayer: [],
      fetch: [],
      mocked: [],
      sendBeacon: [],
    };

    const normalizeUrl = (value) => {
      try {
        return new URL(String(value), window.location.href);
      } catch {
        return null;
      }
    };

    const isChatHandoffPost = (url, method) => {
      const parsed = normalizeUrl(url);
      if (!parsed) return false;
      return (
        method.toUpperCase() === 'POST' &&
        (parsed.pathname.endsWith('/chat-handoffs') || parsed.pathname.endsWith('/chat-handoffs/'))
      );
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const request = input instanceof Request ? input : null;
      const url = typeof input === 'string' ? input : request ? request.url : String(input);
      const method = init.method || request?.method || 'GET';
      const body = typeof init.body === 'string' ? init.body : null;
      window.__craigsLeadEventProbe?.fetch?.push({ url, method, body });

      if (isChatHandoffPost(url, method)) {
        window.__craigsLeadEventProbe?.mocked?.push({ route: 'chat-handoffs', url });
        return new Response(
          JSON.stringify({ ok: true, status: 'accepted', reason: 'codex_probe' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      return originalFetch(input, init);
    };
  });
}

async function waitForGtm(page) {
  await page.waitForFunction(
    (gtmId) => Boolean(window.google_tag_manager?.[gtmId]),
    EXPECTED_GTM_ID,
    { timeout: 20_000 },
  );
}

async function waitForLeadEvent(page, eventName, timeoutMs) {
  await page.waitForFunction(
    (expectedEventName) =>
      [
        ...(Array.isArray(window.dataLayer) ? window.dataLayer : []),
        ...(Array.isArray(window.__craigsLeadEventProbe?.dataLayer)
          ? window.__craigsLeadEventProbe.dataLayer
          : []),
      ].some((entry) => entry?.event === expectedEventName),
    eventName,
    { timeout: timeoutMs },
  );
}

async function waitForMockedRoute(page, route, timeoutMs) {
  await page.waitForFunction(
    (expectedRoute) =>
      Array.isArray(window.__craigsLeadEventProbe?.mocked) &&
      window.__craigsLeadEventProbe.mocked.some((entry) => entry?.route === expectedRoute),
    route,
    { timeout: timeoutMs },
  );
}

async function waitForPersistedChatThread(page, timeoutMs) {
  const handle = await page.waitForFunction(
    () => {
      const threadId = window.sessionStorage.getItem('chatkit-thread-id');
      return typeof threadId === 'string' && /^cthr_[A-Za-z0-9_-]+$/.test(threadId)
        ? threadId
        : false;
    },
    null,
    { timeout: timeoutMs },
  );
  return await handle.jsonValue();
}

async function waitForChatFrame(page, timeoutMs) {
  await page.locator('iframe[name="chatkit"]').waitFor({ state: 'visible', timeout: timeoutMs });
  const frame = page.frameLocator('iframe[name="chatkit"]');
  await frame.locator('main').waitFor({ timeout: timeoutMs });
  return frame;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function parseJsonEvent(value) {
  try {
    const parsed = JSON.parse(value ?? '{}');
    return typeof parsed.event === 'string' ? parsed.event : null;
  } catch {
    return null;
  }
}

function isRouteUrl(url, route) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.endsWith(`/${route}`) || parsed.pathname.endsWith(`/${route}/`);
  } catch {
    return false;
  }
}

async function collectObserved(page, requests) {
  const browserState = await page.evaluate(() => ({
    dataLayer: Array.isArray(window.dataLayer) ? window.dataLayer : [],
    probe: window.__craigsLeadEventProbe ?? null,
  }));
  const browserProbe = browserState.probe;
  const dataLayerEvents = uniqueSorted(
    [...(browserState.dataLayer ?? []), ...(browserProbe?.dataLayer ?? [])]
      .map((entry) => (typeof entry?.event === 'string' ? entry.event : null))
      .filter((eventName) => eventName?.startsWith('lead_')),
  );
  const ga4Events = uniqueSorted(
    requests
      .filter((request) => request.id === EXPECTED_GA4_ID)
      .map((request) => request.eventName)
      .filter((eventName) => eventName?.startsWith('lead_')),
  );
  const leadInteractionEvents = uniqueSorted([
    ...requests
      .filter((request) => request.path.endsWith('/lead-interactions'))
      .map((request) => request.bodyEvent),
    ...(browserProbe?.sendBeacon ?? []).map((entry) => parseJsonEvent(entry.data)),
    ...(browserProbe?.fetch ?? []).map((entry) => parseJsonEvent(entry.body)),
  ]);
  const mockedRoutes = uniqueSorted((browserProbe?.mocked ?? []).map((entry) => entry?.route));
  const chatHandoffRequests = (browserProbe?.fetch ?? []).filter((entry) =>
    isRouteUrl(entry.url, 'chat-handoffs'),
  ).length;
  const leadInteractionRequests =
    requests.filter((request) => request.path.endsWith('/lead-interactions')).length +
    (browserProbe?.sendBeacon ?? []).filter((entry) => isRouteUrl(entry.url, 'lead-interactions'))
      .length +
    (browserProbe?.fetch ?? []).filter((entry) => isRouteUrl(entry.url, 'lead-interactions'))
      .length;
  const gtmLoaded = requests.some(
    (request) =>
      request.host === 'www.googletagmanager.com' && request.url.includes(EXPECTED_GTM_ID),
  );
  const ga4Observed = requests.some((request) => request.id === EXPECTED_GA4_ID);

  return {
    dataLayerEvents,
    ga4Events,
    ga4Observed,
    gtmLoaded,
    chatHandoffRequests,
    leadInteractionRequests,
    leadInteractionEvents,
    mockedRoutes,
  };
}

function assertContains(label, actual, expected) {
  const missing = expected.filter((eventName) => !actual.includes(eventName));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(', ')}`);
  }
}

function assertDoesNotContain(label, actual, forbidden) {
  const present = forbidden.filter((eventName) => actual.includes(eventName));
  if (present.length > 0) {
    throw new Error(`${label} should not include: ${present.join(', ')}`);
  }
}

function assertRouteMocked(observed, route) {
  if (!observed.mockedRoutes.includes(route)) {
    throw new Error(`Expected production probe to mock ${route}, but no mock was used.`);
  }
}

function printTable(title, rows) {
  process.stdout.write(`\n${title}\n`);
  for (const row of rows) {
    process.stdout.write(`- ${row}\n`);
  }
}

function logStep(label, detail) {
  process.stdout.write(`${label}: ${detail}\n`);
}

function printObserved(label, observed, issues) {
  printTable(`${label} observed events`, [
    `GTM container loaded: ${observed.gtmLoaded ? EXPECTED_GTM_ID : 'missing'}`,
    `GA4 measurement id observed: ${observed.ga4Observed ? EXPECTED_GA4_ID : 'missing'}`,
    `dataLayer: ${observed.dataLayerEvents.join(', ') || 'none'}`,
    `GA4 collect: ${observed.ga4Events.join(', ') || 'none'}`,
    `lead-interactions transport: ${observed.leadInteractionEvents.join(', ') || 'none'}`,
    `chat handoff request count: ${observed.chatHandoffRequests}`,
    `lead-interactions request count: ${observed.leadInteractionRequests}`,
    `mocked production routes: ${observed.mockedRoutes.join(', ') || 'none'}`,
  ]);

  if (issues.length > 0) {
    printTable(`${label} browser diagnostics`, issues);
  }
}

function assertCleanInfrastructure(observed, issues, label) {
  if (!observed.gtmLoaded) {
    throw new Error(`${label} did not load expected GTM container ${EXPECTED_GTM_ID}.`);
  }
  if (!observed.ga4Observed) {
    throw new Error(`${label} did not observe expected GA4 measurement id ${EXPECTED_GA4_ID}.`);
  }
  if (issues.length > 0) {
    throw new Error(`${label} saw unexpected browser errors:\n${issues.join('\n')}`);
  }
}

async function probeQuoteForm(browser, options) {
  const { context, issues, page, requests } = await createProbePage(browser);
  try {
    const url = withProbeQuery(`${options.baseUrl}/en/request-a-quote/`, 'quote_form');
    logStep('Quote form', `loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForGtm(page);
    await page
      .locator('astro-island[component-url*="QuoteRequestForm"]:not([ssr])')
      .waitFor({ timeout: options.timeoutMs });

    logStep('Quote form', 'submitting synthetic request');
    await page.locator('form.quote-request-form-card input[name="name"]').fill('Measurement Probe');
    await page.locator('form.quote-request-form-card input[name="phone"]').fill('(408) 555-0199');
    await page
      .locator('form.quote-request-form-card input[name="email"]')
      .fill('measurement-probe@example.com');
    await page
      .locator('form.quote-request-form-card input[name="vehicle"]')
      .fill('Production measurement probe');
    await page
      .locator('form.quote-request-form-card select[name="service"]')
      .selectOption('car-seats');
    await page
      .locator('form.quote-request-form-card textarea[name="message"]')
      .fill('Measurement probe for quote form conversion tracking. Do not contact.');
    await page.getByRole('button', { name: /Submit quote request/i }).click();

    await waitForMockedRoute(page, 'quote-requests', options.timeoutMs);
    await waitForLeadEvent(page, LEAD_EVENTS.formSubmitSuccess, options.timeoutMs);
    await delay(4_000);

    const observed = await collectObserved(page, requests);
    printObserved('Quote form production conversion probe', observed, issues);
    assertCleanInfrastructure(observed, issues, 'Quote form production conversion probe');
    assertRouteMocked(observed, 'quote-requests');
    assertContains('quote form dataLayer events', observed.dataLayerEvents, [
      LEAD_EVENTS.formSubmitSuccess,
    ]);
    assertContains('quote form GA4 collect events', observed.ga4Events, [
      LEAD_EVENTS.formSubmitSuccess,
    ]);
  } finally {
    await context.close();
  }
}

async function probeChat(browser, options) {
  const { context, issues, page, requests } = await createProbePage(browser, {
    installInitScript: false,
  });
  try {
    const url = withProbeQuery(`${options.baseUrl}/en/`, 'chat');
    logStep('ChatKit', `loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForGtm(page);

    const frame = await waitForChatFrame(page, options.timeoutMs);
    logStep('ChatKit', 'sending first message');
    await frame
      .getByRole('textbox')
      .first()
      .fill('I need help with a driver seat tear. This is a measurement probe, do not contact.');
    await frame.getByRole('textbox').first().press('Enter');
    const threadId = await waitForPersistedChatThread(page, options.timeoutMs);
    await frame.getByRole('heading', { name: 'You said:' }).waitFor({ timeout: options.timeoutMs });
    await frame.getByRole('heading', { name: 'The assistant said:' }).waitFor({
      timeout: options.timeoutMs,
    });
    await waitForLeadEvent(page, LEAD_EVENTS.chatFirstMessageSent, options.timeoutMs);

    await installChatHandoffMock(page);
    logStep('ChatKit', 'triggering synthetic handoff completion');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    await waitForMockedRoute(page, 'chat-handoffs', options.timeoutMs);
    await waitForLeadEvent(page, LEAD_EVENTS.chatHandoffCompleted, options.timeoutMs);
    await delay(4_000);

    const observed = await collectObserved(page, requests);
    printTable('ChatKit production conversion probe', [`Thread id: ${threadId}`]);
    printObserved('ChatKit production conversion probe', observed, issues);
    assertCleanInfrastructure(observed, issues, 'ChatKit production conversion probe');
    assertRouteMocked(observed, 'chat-handoffs');
    assertContains('chat dataLayer events', observed.dataLayerEvents, [
      LEAD_EVENTS.chatFirstMessageSent,
      LEAD_EVENTS.chatHandoffCompleted,
    ]);
    assertContains('chat GA4 collect events', observed.ga4Events, [
      LEAD_EVENTS.chatFirstMessageSent,
      LEAD_EVENTS.chatHandoffCompleted,
    ]);
    assertContains('chat lead-interactions transport events', observed.leadInteractionEvents, [
      LEAD_EVENTS.chatFirstMessageSent,
    ]);
  } finally {
    await context.close();
  }
}

async function probePassiveChat(browser, options) {
  const { context, issues, page, requests } = await createProbePage(browser, {
    mockFetch: true,
    mockLeadInteractions: true,
  });
  try {
    const url = withProbeQuery(`${options.baseUrl}/en/`, 'chat_passive');
    logStep('Passive ChatKit', `loading ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForGtm(page);
    const setupFrame = await waitForChatFrame(page, options.timeoutMs);

    logStep('Passive ChatKit', 'creating setup thread before passive restore');
    await setupFrame
      .getByRole('textbox')
      .first()
      .fill('Passive restore setup message. This is a measurement probe, do not contact.');
    await setupFrame.getByRole('textbox').first().press('Enter');
    const setupThreadId = await waitForPersistedChatThread(page, options.timeoutMs);
    await waitForLeadEvent(page, LEAD_EVENTS.chatFirstMessageSent, options.timeoutMs);
    await delay(4_000);

    requests.length = 0;
    issues.length = 0;

    const restoreUrl = withProbeQuery(`${options.baseUrl}/en/`, 'chat_passive_restore');
    logStep('Passive ChatKit', `reloading restored thread ${setupThreadId}`);
    await page.goto(restoreUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitForGtm(page);
    await waitForChatFrame(page, options.timeoutMs);
    await delay(3_000);

    const threadId = await page.evaluate(() => window.sessionStorage.getItem('chatkit-thread-id'));
    printTable('Passive ChatKit production conversion probe', [
      `Setup thread id: ${setupThreadId}`,
      `Thread id after passive restore: ${threadId || 'none'}`,
    ]);
    if (threadId !== setupThreadId) {
      throw new Error(
        `Passive ChatKit restore did not keep the setup thread. Expected ${setupThreadId}, received ${threadId || 'none'}.`,
      );
    }

    logStep('Passive ChatKit', 'triggering pagehide without chat interaction');
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });
    await delay(2_000);

    const observed = await collectObserved(page, requests);
    printObserved('Passive ChatKit production conversion probe', observed, issues);
    assertCleanInfrastructure(observed, issues, 'Passive ChatKit production conversion probe');

    if (observed.chatHandoffRequests !== 0) {
      throw new Error(
        `Passive ChatKit should not request /chat-handoffs, saw ${observed.chatHandoffRequests}.`,
      );
    }
    if (observed.leadInteractionRequests !== 0) {
      throw new Error(
        `Passive ChatKit should not send /lead-interactions, saw ${observed.leadInteractionRequests}.`,
      );
    }
    assertDoesNotContain('passive chat dataLayer events', observed.dataLayerEvents, [
      LEAD_EVENTS.chatFirstMessageSent,
      LEAD_EVENTS.chatHandoffCompleted,
      LEAD_EVENTS.chatHandoffBlocked,
      LEAD_EVENTS.chatHandoffDeferred,
      LEAD_EVENTS.chatHandoffError,
    ]);
    assertDoesNotContain('passive chat GA4 collect events', observed.ga4Events, [
      LEAD_EVENTS.chatHandoffCompleted,
      LEAD_EVENTS.chatHandoffBlocked,
      LEAD_EVENTS.chatHandoffDeferred,
      LEAD_EVENTS.chatHandoffError,
    ]);
    assertDoesNotContain('passive chat lead-interactions events', observed.leadInteractionEvents, [
      LEAD_EVENTS.chatFirstMessageSent,
      LEAD_EVENTS.chatHandoffCompleted,
      LEAD_EVENTS.chatHandoffBlocked,
      LEAD_EVENTS.chatHandoffDeferred,
      LEAD_EVENTS.chatHandoffError,
    ]);
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: !options.headed });
  try {
    printTable('Production conversion probe setup', [
      `Base URL: ${options.baseUrl}`,
      `Flow: ${options.flow}`,
      'Safety: quote submit and chat handoff POSTs are mocked in-browser; passive chat lead-interactions are mocked; GTM/GA4 requests are live.',
    ]);

    if (options.flow === 'all' || options.flow === 'quote-form') {
      await probeQuoteForm(browser, options);
    }
    if (options.flow === 'all' || options.flow === 'chat-passive') {
      await probePassiveChat(browser, options);
    }
    if (options.flow === 'all' || options.flow === 'chat') {
      await probeChat(browser, options);
    }

    process.stdout.write('\nOK production conversion milestone proof passed.\n');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`\nERROR ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
