import type {
  ManagedConversionDecisionType,
  ManagedConversionDestinationKey,
  ManagedConversionFeedbackStatus,
} from '@craigs/contracts/managed-conversion-contract';

export type LeadConversionDecisionStatus = 'active' | 'suppressed' | 'retracted';
export type LeadConversionDecisionActor = 'admin' | 'system';
export type ProviderConversionDestinationMode = 'manual' | 'provider_api';
export type ProviderConversionDestinationSource = 'environment' | 'config_file' | 'system';

export type LeadConversionDecision = {
  decision_id: string;
  lead_record_id: string;
  journey_id: string;
  decision_type: ManagedConversionDecisionType;
  decision_status: LeadConversionDecisionStatus;
  actor: LeadConversionDecisionActor;
  reason: string | null;
  conversion_value: number | null;
  currency_code: string | null;
  source_event_id: string | null;
  occurred_at_ms: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type ProviderConversionDestination = {
  destination_key: ManagedConversionDestinationKey;
  destination_label: string;
  enabled: boolean;
  delivery_mode: ProviderConversionDestinationMode;
  config_source: ProviderConversionDestinationSource;
  provider_config: Record<string, string | number | boolean | null>;
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadConversionFeedbackOutboxItem = {
  outbox_id: string;
  decision_id: string;
  lead_record_id: string;
  journey_id: string;
  destination_key: ManagedConversionDestinationKey;
  destination_label: string;
  status: ManagedConversionFeedbackStatus;
  status_reason: string | null;
  signal_keys: string[];
  dedupe_key: string;
  payload_contract: string;
  attempt_count: number;
  lease_owner: string | null;
  lease_expires_at_ms: number | null;
  next_attempt_at_ms: number | null;
  last_outcome_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadConversionFeedbackOutcome = {
  outbox_id: string;
  outcome_sort_key: string;
  outcome_id: string;
  decision_id: string;
  lead_record_id: string;
  journey_id: string;
  destination_key: ManagedConversionDestinationKey;
  destination_label: string;
  status: ManagedConversionFeedbackStatus;
  message: string | null;
  provider_response_id: string | null;
  error_code: string | null;
  diagnostics_url: string | null;
  occurred_at_ms: number;
  recorded_at_ms: number;
  payload: Record<string, unknown>;
};
