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
  display_name_confidence?: string | null;
  display_name_source_channel?: string | null;
  display_name_source_method?: string | null;
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

export type FollowupWorkItem = {
  idempotency_key?: string;
  followup_work_id?: string;
  source_event_id?: string;
  status?: string;
  capture_channel?: string;
  lead_record_id?: string | null;
  journey_id?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  vehicle?: string;
  service?: string;
  lead_summary?: {
    project_summary?: string;
    missing_info?: string[];
  } | null;
  customer_response_policy?: string;
  customer_response_policy_reason?: string;
  origin?: string;
  page_url?: string;
  sms_status?: string | null;
  email_status?: string | null;
  lead_notification_status?: string | null;
  outreach_result?: string | null;
  error?: string | null;
  lock_expires_at?: number | null;
  created_at?: number;
  updated_at?: number;
  age_seconds?: number;
  stale?: boolean;
  retry_allowed?: boolean;
  manual_resolution_allowed?: boolean;
  action_block_reason?: string | null;
  operator_resolution?: string | null;
  operator_resolution_reason?: string | null;
  operator_resolved_at?: number | null;
};

export type LeadsApiResponse = {
  lead_records?: LeadRecordItem[];
  journeys?: JourneyItem[];
  followup_work?: FollowupWorkItem[];
  next_records_cursor?: string | null;
  next_journeys_cursor?: string | null;
};

export type QualificationFilter = '' | 'true' | 'false';

export type AdminLeadsState = {
  auth: string;
  loading: boolean;
  leadRecords: LeadRecordItem[];
  journeys: JourneyItem[];
  followupWork: FollowupWorkItem[];
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
  onRetryFollowupWork: (idempotencyKey: string) => void;
  onResolveFollowupWorkManually: (idempotencyKey: string) => void;
};
