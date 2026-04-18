import { CHATKIT_RUNTIME_URLS } from './constants.js';

let chatkitRuntimePromise = null;

function hasChatkitRuntime() {
  return Boolean(globalThis.customElements?.get?.('openai-chatkit'));
}

async function waitForChatkitRuntime(timeoutMs = 2000) {
  if (hasChatkitRuntime()) return;
  const whenDefined = globalThis.customElements?.whenDefined?.('openai-chatkit');
  if (!whenDefined) return;

  let timeoutId;
  await Promise.race([
    whenDefined,
    new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Timed out waiting for ChatKit runtime to register.'));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.chatkitRuntimeError === 'true') {
        reject(new Error(`Failed to load ${src}`));
      } else {
        resolve();
      }
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    // The widget owns runtime loading so ChatKit is only fetched when the island is active.
    script.async = true;
    script.dataset.chatkitRuntime = 'true';
    script.addEventListener(
      'load',
      () => {
        script.dataset.chatkitRuntimeLoaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        script.dataset.chatkitRuntimeError = 'true';
        reject(new Error(`Failed to load ${src}`));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
}

export async function ensureChatkitRuntime() {
  if (hasChatkitRuntime()) return;
  if (chatkitRuntimePromise) return chatkitRuntimePromise;

  chatkitRuntimePromise = (async () => {
    const errors = [];
    for (const src of CHATKIT_RUNTIME_URLS) {
      try {
        await loadScript(src);
        await waitForChatkitRuntime();
        if (hasChatkitRuntime()) return;
      } catch (err) {
        errors.push(err);
      }
    }
    const message = errors.map((e) => e?.message).filter(Boolean).join(' | ');
    throw new Error(message || 'ChatKit runtime failed to load.');
  })();

  return chatkitRuntimePromise;
}
