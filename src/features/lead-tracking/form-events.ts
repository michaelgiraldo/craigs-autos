type LeadEventValue = boolean | number | string | null | undefined;

type DataLayerEvent = Record<string, LeadEventValue>;

export function createClientEventId(prefix: string): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return `${prefix}_${crypto.randomUUID()}`;
	}

	return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function pushLeadDataLayerEvent(
	eventName: string,
	params: DataLayerEvent,
	attribution: DataLayerEvent | null,
) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		const dataLayerWindow = window as Window & { dataLayer?: DataLayerEvent[] };
		dataLayerWindow.dataLayer = dataLayerWindow.dataLayer || [];
		dataLayerWindow.dataLayer.push({
			event: eventName,
			...(attribution ?? {}),
			...params,
		});
	} catch {
		// Ignore analytics failures.
	}
}
