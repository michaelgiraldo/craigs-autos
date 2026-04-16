import { CLICK_KEYS, STORAGE_KEY, UTM_KEYS } from '../attribution-core';

const ATTRIBUTION_QUERY_KEYS = [...CLICK_KEYS, ...UTM_KEYS];
const COOKIE_ATTRIBUTION_KEYS = ['gclid', 'gbraid', 'wbraid'] as const;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function buildAttributionBootstrap(): string {
  return `(() => {
	try {
		const params = new URLSearchParams(window.location.search);
		const keys = ${JSON.stringify(ATTRIBUTION_QUERY_KEYS)};
		const next = {};

		for (const key of keys) {
			const value = params.get(key);
			if (value) {
				next[key] = value;
			}
		}

		const hasNext = Object.keys(next).length > 0;
		const storageKey = ${JSON.stringify(STORAGE_KEY)};
		let existing = {};

		try {
			existing = JSON.parse(window.localStorage.getItem(storageKey) || '{}') || {};
		} catch {
			existing = {};
		}

		const now = new Date().toISOString();
		const updated = existing || {};

		if (hasNext) {
			const touch = Object.assign({ ts: now, landing_page: window.location.pathname }, next);
			updated.last_touch = touch;
			if (!updated.first_touch) {
				updated.first_touch = touch;
			}
		}

		if (!updated.referrer && document.referrer) {
			updated.referrer = document.referrer;
		}

		if (!updated.landing_page) {
			updated.landing_page = window.location.pathname;
		}

		if (Object.keys(updated).length) {
			window.localStorage.setItem(storageKey, JSON.stringify(updated));
		}

		const cookieKeys = ${JSON.stringify(COOKIE_ATTRIBUTION_KEYS)};
		const maxAge = ${COOKIE_MAX_AGE_SECONDS};

		for (const key of cookieKeys) {
			if (!next[key]) continue;
			document.cookie =
				key +
				'=' +
				encodeURIComponent(next[key]) +
				'; path=/; max-age=' +
				maxAge +
				'; SameSite=Lax';
		}
	} catch {}
})();`;
}
