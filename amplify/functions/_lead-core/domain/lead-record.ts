import type { AttributionSnapshot } from './attribution.ts';
import type { CaptureChannel, CustomerAction } from './lead-actions.ts';

export type LeadRecordStatus =
  | 'new'
  | 'ready_for_outreach'
  | 'outreach_sent'
  | 'awaiting_customer'
  | 'qualified'
  | 'archived'
  | 'error';

export type LeadOutreachChannel = 'sms' | 'email' | null;

export type LeadOutreachStatus = 'sent' | 'failed' | 'skipped' | 'not_attempted';

export type LeadOutreachProvider = 'quo' | 'ses' | null;

export type LeadOutreachSnapshot = {
  channel: LeadOutreachChannel;
  status: LeadOutreachStatus;
  provider: LeadOutreachProvider;
  external_id: string | null;
  error: string | null;
  sent_at_ms: number | null;
};

export type LeadQualificationSnapshot = {
  qualified: boolean;
  qualified_at_ms: number | null;
  uploaded_google_ads: boolean;
  uploaded_google_ads_at_ms: number | null;
};

export type LeadRecord = {
  lead_record_id: string;
  journey_id: string;
  contact_id: string | null;
  status: LeadRecordStatus;
  capture_channel: CaptureChannel;
  title: string;
  vehicle: string | null;
  service: string | null;
  project_summary: string | null;
  customer_message: string | null;
  customer_language: string | null;
  attribution: AttributionSnapshot | null;
  latest_outreach: LeadOutreachSnapshot;
  qualification: LeadQualificationSnapshot;
  first_action: CustomerAction | null;
  latest_action: CustomerAction | null;
  action_types: CustomerAction[];
  action_count: number;
  created_at_ms: number;
  updated_at_ms: number;
};
