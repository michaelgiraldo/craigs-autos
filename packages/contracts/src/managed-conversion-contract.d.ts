export declare const MANAGED_CONVERSION_CONTRACT: 'craigs-managed-conversions-v1';

export type ManagedConversionDestinationKey =
  | 'google_ads'
  | 'microsoft_ads'
  | 'meta_ads'
  | 'tiktok_ads'
  | 'linkedin_ads'
  | 'pinterest_ads'
  | 'snap_ads'
  | 'yelp_ads'
  | 'manual_export';

export type ManagedConversionFeedbackStatus =
  | 'not_ready'
  | 'needs_signal'
  | 'needs_destination_config'
  | 'ready'
  | 'queued'
  | 'sent'
  | 'accepted'
  | 'warning'
  | 'failed'
  | 'attributed'
  | 'suppressed'
  | 'retracted';

export type ManagedConversionDecisionType =
  | 'qualified_lead'
  | 'booked_job'
  | 'completed_job'
  | 'lost_lead'
  | 'spam'
  | 'not_a_fit';

export type ManagedConversionDestinationDefinition = {
  readonly key: ManagedConversionDestinationKey;
  readonly label: string;
  readonly clickIdKeys: readonly string[];
  readonly browserIdKeys: readonly string[];
  readonly supportsEnhancedIdentity: boolean;
};

export declare const MANAGED_CONVERSION_DESTINATIONS: Readonly<
  Record<ManagedConversionDestinationKey, ManagedConversionDestinationDefinition>
>;

export declare const MANAGED_CONVERSION_DESTINATION_KEYS: readonly ManagedConversionDestinationKey[];

export declare const MANAGED_CONVERSION_DECISION_TYPES: readonly ManagedConversionDecisionType[];

export declare const MANAGED_CONVERSION_FEEDBACK_STATUSES: readonly ManagedConversionFeedbackStatus[];

export type ManagedConversionSignalInput = {
  attribution?: Record<string, unknown> | null;
  contact?: Record<string, unknown> | null;
};

export type ManagedConversionSignals = {
  click_ids: Record<string, string>;
  browser_ids: Record<string, string>;
  has_email: boolean;
  has_phone: boolean;
};

export type ManagedConversionDestinationEvaluation = {
  destination_key: ManagedConversionDestinationKey;
  destination_label: string;
  eligible: boolean;
  reasons: string[];
};

export type ManagedConversionFeedbackSummary = {
  contract: typeof MANAGED_CONVERSION_CONTRACT;
  status: ManagedConversionFeedbackStatus;
  status_label: string;
  reason: string;
  configured_destination_keys: ManagedConversionDestinationKey[];
  eligible_destination_keys: ManagedConversionDestinationKey[];
  candidate_destination_keys: ManagedConversionDestinationKey[];
  primary_destination_key: ManagedConversionDestinationKey | null;
  destination_labels: string[];
  signal_keys: string[];
};

export declare function parseManagedConversionDestinations(
  value: string | readonly unknown[] | null | undefined,
): ManagedConversionDestinationKey[];

export declare function extractManagedConversionSignals(
  input?: ManagedConversionSignalInput,
): ManagedConversionSignals;

export declare function evaluateManagedConversionDestination(
  destinationKey: unknown,
  input?: ManagedConversionSignalInput,
): ManagedConversionDestinationEvaluation | null;

export declare function summarizeManagedConversionFeedback(
  input?: ManagedConversionSignalInput & {
    qualified?: boolean | null;
    configuredDestinationKeys?: string | readonly unknown[] | null;
  },
): ManagedConversionFeedbackSummary;
