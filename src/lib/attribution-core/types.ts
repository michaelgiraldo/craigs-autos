import type { CLICK_KEYS, UTM_KEYS } from './constants';

export type ClickKey = (typeof CLICK_KEYS)[number];
export type UtmKey = (typeof UTM_KEYS)[number];

export type TouchRecord = Partial<Record<ClickKey | UtmKey | 'ts' | 'landing_page', string>>;

export type StoredAttributionState = {
  first_touch?: TouchRecord | null;
  last_touch?: TouchRecord | null;
  landing_page?: string | null;
  referrer?: string | null;
};

export type StoredJourneyState = {
  journey_id?: string | null;
  source_fingerprint?: string | null;
  started_at_ms?: number | null;
  updated_at_ms?: number | null;
};

export type AttributionPayload = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  msclkid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  first_touch_ts: string | null;
  last_touch_ts: string | null;
  landing_page: string | null;
  referrer: string | null;
  device_type: 'mobile' | 'desktop' | null;
  referrer_host: string | null;
  source_platform: string | null;
  acquisition_class: 'paid' | 'organic' | 'owned' | 'referral' | 'direct' | null;
  click_id_type: string | null;
};
