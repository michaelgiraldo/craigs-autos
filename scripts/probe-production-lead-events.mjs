import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';

const DEFAULT_URL = 'https://craigs.autos/en/contact/';
const DEFAULT_TIMEOUT_MS = 60_000;
const EXPECTED_GTM_ID = 'GTM-WQJLM7R6';
const EXPECTED_GA4_ID = 'G-0JLX2NGBTV';

const EVENT_PROBES = [
  {
    label: 'call',
    selector: 'a[href^="tel:"]',
    eventName: LEAD_EVENTS.clickToCall,
  },
  {
    label: 'text',
    selector: 'a[href^="sms:"]',
    eventName: LEAD_EVENTS.clickToText,
  },
  {
    label: 'email',
    selector: 'a[href^="mailto:"]',
    eventName: LEAD_EVENTS.clickEmail,
  },
  {
    label: 'google_maps',
    selector: 'a[href^="https://www.google.com/maps/dir/"]',
    eventName: LEAD_EVENTS.clickDirections,
  },
];

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    headed: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') {
      options.url = argv[i + 1] ?? '';
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

  if (!/^https?:\/\//i.test(options.url)) {
    throw new Error(`Expected --url to be an absolute http(s) URL. Received: ${options.url}`);
  }

  return options;
}

function withProbeQuery(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('codex_probe', String(Date.now()));
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

function installProbeScript() {
  return `(() => {
    const probe = {
      dataLayer: [],
      preventedClicks: [],
      sendBeacon: [],
      fetch: [],
    };

    const clone = (value) => {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return { unserializable: true };
      }
    };

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

    const shouldPreventLeadLink = (href) =>
      href.startsWith('tel:') ||
      href.startsWith('sms:') ||
      href.startsWith('mailto:') ||
      href.startsWith('https://www.google.com/maps/dir/') ||
      href.startsWith('https://maps.apple.com/');

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const anchor = target?.closest ? target.closest('a') : null;
        const href = anchor?.getAttribute ? anchor.getAttribute('href') || '' : '';
        if (!href || !shouldPreventLeadLink(href)) return;
        probe.preventedClicks.push({ href });
        event.preventDefault();
      },
      { capture: true },
    );

    if (typeof navigator.sendBeacon === 'function') {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        probe.sendBeacon.push({ url: String(url), data: typeof data === 'string' ? data : null });
        return originalSendBeacon(url, data);
      };
    }

    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
        const body = typeof init.body === 'string' ? init.body : null;
        probe.fetch.push({ url, method: init.method || 'GET', body });
        return originalFetch(input, init);
      };
    }

    window.__craigsLeadEventProbe = probe;
  })();`;
}

async function clickProbe(page, probe) {
  const locator = page.locator(probe.selector).first();
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const href = await locator.getAttribute('href');
  await locator.click({ timeout: 10_000 });
  await delay(2_000);
  return { label: probe.label, eventName: probe.eventName, href };
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function eventFound(events, eventName) {
  return events.includes(eventName);
}

function assertExpected(label, missing) {
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(', ')}`);
  }
}

function printTable(title, rows) {
  process.stdout.write(`\n${title}\n`);
  for (const row of rows) {
    process.stdout.write(`- ${row}\n`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const clicked = [];

  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CraigMeasurementProbe/1.0',
    });
    await context.addInitScript({ content: installProbeScript() });

    const page = await context.newPage();
    page.on('request', (request) => {
      const summary = summarizeRequest(request);
      if (summary) requests.push(summary);
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    const probeUrl = withProbeQuery(options.url);
    await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await page.waitForFunction(
      (gtmId) => Boolean(window.google_tag_manager?.[gtmId]),
      EXPECTED_GTM_ID,
      { timeout: 20_000 },
    );

    for (const probe of EVENT_PROBES) {
      clicked.push(await clickProbe(page, probe));
    }

    await delay(4_000);

    const browserProbe = await page.evaluate(() => window.__craigsLeadEventProbe);
    const dataLayerEvents = uniqueSorted(
      (browserProbe?.dataLayer ?? [])
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
      ...(browserProbe?.sendBeacon ?? []).map((entry) => {
        try {
          return JSON.parse(entry.data ?? '{}').event;
        } catch {
          return null;
        }
      }),
      ...(browserProbe?.fetch ?? []).map((entry) => {
        try {
          return JSON.parse(entry.body ?? '{}').event;
        } catch {
          return null;
        }
      }),
    ]);

    const expectedEvents = uniqueSorted(EVENT_PROBES.map((probe) => probe.eventName));
    const gtmLoaded = requests.some(
      (request) =>
        request.host === 'www.googletagmanager.com' && request.url.includes(EXPECTED_GTM_ID),
    );
    const missingDataLayer = expectedEvents.filter(
      (eventName) => !eventFound(dataLayerEvents, eventName),
    );
    const missingGa4 = expectedEvents.filter((eventName) => !eventFound(ga4Events, eventName));
    const missingLeadTransport = expectedEvents.filter(
      (eventName) => !eventFound(leadInteractionEvents, eventName),
    );

    printTable('Production lead-event probe', [
      `URL: ${probeUrl}`,
      `GTM container loaded: ${gtmLoaded ? EXPECTED_GTM_ID : 'missing'}`,
      `GA4 measurement id observed: ${
        requests.some((request) => request.id === EXPECTED_GA4_ID) ? EXPECTED_GA4_ID : 'missing'
      }`,
      `Clicked: ${clicked.map((entry) => `${entry.label} (${entry.eventName})`).join(', ')}`,
    ]);
    printTable('Observed events', [
      `dataLayer: ${dataLayerEvents.join(', ') || 'none'}`,
      `GA4 collect: ${ga4Events.join(', ') || 'none'}`,
      `lead-interactions transport: ${leadInteractionEvents.join(', ') || 'none'}`,
    ]);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      printTable('Browser diagnostics', [
        ...consoleErrors.map((message) => `console error: ${message}`),
        ...pageErrors.map((message) => `page error: ${message}`),
      ]);
    }

    assertExpected('GTM container request', gtmLoaded ? [] : [EXPECTED_GTM_ID]);
    assertExpected('dataLayer lead events', missingDataLayer);
    assertExpected('GA4 collect lead events', missingGa4);
    assertExpected('lead-interactions transport events', missingLeadTransport);

    process.stdout.write('\nOK production lead-event proof passed.\n');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`\nERROR ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
