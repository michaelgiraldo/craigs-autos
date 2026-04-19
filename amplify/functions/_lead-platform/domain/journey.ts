import type { AttributionSnapshot } from './attribution.ts';
import type { CaptureChannel, CustomerAction } from './lead-actions.ts';

export type JourneyStatus =
  | 'active'
  | 'captured'
  | 'incomplete'
  | 'verified'
  | 'qualified'
  | 'archived';

export type JourneyMetadata = {
  lead_user_id: string | null;
  thread_id: string | null;
  locale: string | null;
  page_url: string | null;
  page_path: string | null;
  origin: string | null;
  site_label: string | null;
  attribution: AttributionSnapshot | null;
};

export type Journey = {
  journey_id: string;
  lead_record_id: string | null;
  contact_id: string | null;
  journey_status: JourneyStatus;
  status_reason: string | null;
  capture_channel: CaptureChannel | null;
  first_action: CustomerAction | null;
  latest_action: CustomerAction | null;
  action_types: CustomerAction[];
  action_count: number;
  lead_user_id: string | null;
  thread_id: string | null;
  locale: string | null;
  page_url: string | null;
  page_path: string | null;
  origin: string | null;
  site_label: string | null;
  attribution: AttributionSnapshot | null;
  created_at_ms: number;
  updated_at_ms: number;
};
