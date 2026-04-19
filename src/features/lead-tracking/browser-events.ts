import {
  buildLeadDataLayerEvent,
  type LeadDataLayerEventName,
  type LeadDataLayerParams,
  type LeadDataLayerValue,
} from '@craigs/contracts/lead-event-contract';

export type { LeadDataLayerEventName, LeadDataLayerParams, LeadDataLayerValue };

export function createClientEventId(prefix: string): string {
  const runtimeCrypto = globalThis.crypto;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    return `${prefix}_${runtimeCrypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function pushLeadDataLayerEvent(
  eventName: LeadDataLayerEventName | string,
  params: LeadDataLayerParams,
  attribution: LeadDataLayerParams | null = null,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const leadEvent = buildLeadDataLayerEvent(eventName, {
      ...(attribution ?? {}),
      ...params,
    });
    if (!leadEvent) {
      return;
    }

    const dataLayerWindow = window as Window & { dataLayer?: LeadDataLayerParams[] };
    dataLayerWindow.dataLayer = dataLayerWindow.dataLayer || [];
    dataLayerWindow.dataLayer.push(leadEvent);
  } catch {
    // Ignore analytics failures.
  }
}
