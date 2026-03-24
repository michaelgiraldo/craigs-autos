export type LambdaHeaders = Record<string, string | undefined>;

export type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type LeadEmailRequest = {
  threadId?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
  reason?: unknown;
  attribution?: unknown;
};

export type TranscriptLine = {
  created_at: number;
  speaker: string;
  text: string;
};

export type LeadSummary = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_location: string | null;
  customer_language: string | null;
  vehicle: string | null;
  project: string | null;
  timeline: string | null;
  handoff_ready: boolean;
  handoff_reason: string;
  summary: string;
  next_steps: string[];
  follow_up_questions: string[];
  call_script_prompts: string[];
  outreach_message: string | null;
  missing_info: string[];
};

export type LeadDedupeStatus = 'sending' | 'sent' | 'error';

export type LeadDedupeRecord = {
  thread_id: string;
  status: LeadDedupeStatus;
  lock_expires_at?: number;
  lease_id?: string;
  created_at?: number;
  updated_at?: number;
  attempts?: number;
  sent_at?: number;
  message_id?: string;
  last_reason?: string;
  last_error?: string;
  ttl?: number;
};

export type LeadAttributionPayload = {
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
  referrer_host: string | null;
  device_type: 'mobile' | 'desktop' | null;
  source_platform: string | null;
  click_id_type: string | null;
};

export type LeadCaseRecord = {
  lead_id: string;
  thread_id: string | null;
  created_at: number;
  lead_method: string;
  lead_reason: string;
  lead_intent_type: 'call' | 'text' | 'email' | 'directions' | 'chat';
  locale: string | null;
  page_url: string | null;
  user_id: string | null;
  qualified: boolean;
  qualified_at: number | null;
  uploaded_google_ads: boolean;
  uploaded_google_ads_at: number | null;
  device_type: 'mobile' | 'desktop' | null;
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
  referrer_host: string | null;
  source_platform: string | null;
  click_id_type: string | null;
  click_url: string | null;
  provider: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  ttl: number;
};
