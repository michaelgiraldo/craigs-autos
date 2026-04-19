export type ConversionFeedbackDecisionItem = {
  decision_id?: string;
  decision_type?: string;
  decision_status?: string;
  actor?: string;
  reason?: string | null;
  conversion_value?: number | null;
  currency_code?: string | null;
  occurred_at_ms?: number;
  updated_at_ms?: number;
};

export type ConversionFeedbackOutcomeItem = {
  outbox_id?: string;
  outcome_id?: string;
  status?: string;
  message?: string | null;
  provider_response_id?: string | null;
  error_code?: string | null;
  diagnostics_url?: string | null;
  occurred_at_ms?: number;
};

export type ConversionFeedbackOutboxItem = {
  outbox_id?: string;
  decision_id?: string;
  destination_key?: string;
  destination_label?: string;
  status?: string;
  status_reason?: string | null;
  signal_keys?: string[];
  attempt_count?: number;
  lease_owner?: string | null;
  lease_expires_at_ms?: number | null;
  next_attempt_at_ms?: number | null;
  last_outcome_at_ms?: number | null;
  updated_at_ms?: number;
  latest_outcome?: ConversionFeedbackOutcomeItem | null;
};

export type ConversionFeedbackDetail = {
  decisions?: ConversionFeedbackDecisionItem[];
  outbox_items?: ConversionFeedbackOutboxItem[];
  outcomes?: ConversionFeedbackOutcomeItem[];
};

export type LeadRecordItem = {
  lead_record_id?: string;
  journey_id?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
  status?: string;
  capture_channel?: string;
  first_action?: string | null;
  latest_action?: string | null;
  action_count?: number;
  title?: string;
  display_name?: string | null;
  normalized_phone?: string | null;
  normalized_email?: string | null;
  device_type?: string;
  source_platform?: string;
  acquisition_class?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  click_id_type?: string | null;
  click_id?: string | null;
  qualified?: boolean;
  conversion_feedback?: {
    status?: string;
    status_label?: string;
    reason?: string;
    configured_destination_keys?: string[];
    eligible_destination_keys?: string[];
    candidate_destination_keys?: string[];
    primary_destination_key?: string | null;
    destination_labels?: string[];
    signal_keys?: string[];
  };
  conversion_feedback_detail?: ConversionFeedbackDetail;
  outreach_channel?: string | null;
  outreach_status?: string | null;
};

export type JourneyItem = {
  journey_id?: string;
  lead_record_id?: string | null;
  journey_status?: string;
  status_reason?: string | null;
  capture_channel?: string | null;
  first_action?: string | null;
  latest_action?: string | null;
  action_types?: string[];
  action_count?: number;
  thread_id?: string | null;
  lead_user_id?: string | null;
  source_platform?: string | null;
  acquisition_class?: string | null;
  landing_page?: string | null;
  referrer_host?: string | null;
  created_at_ms?: number;
  updated_at_ms?: number;
};

export type LeadsApiResponse = {
  lead_records?: LeadRecordItem[];
  journeys?: JourneyItem[];
  next_records_cursor?: string | null;
  next_journeys_cursor?: string | null;
};

export type QualificationFilter = '' | 'true' | 'false';

export type AdminLeadsState = {
  auth: string;
  loading: boolean;
  leadRecords: LeadRecordItem[];
  journeys: JourneyItem[];
  error: string | null;
  filterQualified: QualificationFilter;
  recordsCursor: string | null;
  journeysCursor: string | null;
};

export type AdminLeadsActions = {
  onFilterChange: (value: QualificationFilter) => void;
  onLogin: (password: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onUpdateLead: (leadRecordId: string, qualified: boolean) => void;
};
