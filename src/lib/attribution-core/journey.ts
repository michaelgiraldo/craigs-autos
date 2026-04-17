import { createJourneyId } from './browser-values';
import { JOURNEY_IDLE_TIMEOUT_MS } from './constants';
import { getAttributionPayloadFromBrowser } from './payload';
import { buildSourceFingerprint } from './source-classification';
import { readJourneyStorage, writeJourneyStorage } from './storage';

export function getLeadJourneyId(): string | null {
  if (typeof window === 'undefined') return null;
  const nowMs = Date.now();
  const attribution = getAttributionPayloadFromBrowser();
  const nextFingerprint = buildSourceFingerprint(attribution);
  const stored = readJourneyStorage();
  const stale =
    typeof stored?.updated_at_ms === 'number'
      ? nowMs - stored.updated_at_ms > JOURNEY_IDLE_TIMEOUT_MS
      : true;
  const sourceChanged =
    typeof stored?.source_fingerprint === 'string' &&
    stored.source_fingerprint.length > 0 &&
    stored.source_fingerprint !== nextFingerprint;

  const journeyId =
    !stale && !sourceChanged && typeof stored?.journey_id === 'string' && stored.journey_id.trim()
      ? stored.journey_id.trim()
      : createJourneyId();

  writeJourneyStorage({
    journey_id: journeyId,
    source_fingerprint: nextFingerprint,
    started_at_ms:
      !stale && !sourceChanged && typeof stored?.started_at_ms === 'number'
        ? stored.started_at_ms
        : nowMs,
    updated_at_ms: nowMs,
  });

  return journeyId;
}
