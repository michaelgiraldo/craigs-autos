import type { ManagedConversionDestinationKey } from '@craigs/contracts/managed-conversion-contract';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  ProviderConversionDestination,
} from '../../domain/conversion-feedback.ts';
import type { LeadContact } from '../../domain/contact.ts';
import type { LeadRecord } from '../../domain/lead-record.ts';
import type { ManagedConversionFeedbackStatus } from '@craigs/contracts/managed-conversion-contract';

export type ProviderExecutionMode = 'disabled' | 'dry_run' | 'test' | 'live';

export type ManagedConversionFeedbackDeliveryResult = {
  status: ManagedConversionFeedbackStatus;
  message: string;
  providerResponseId?: string | null;
  errorCode?: string | null;
  diagnosticsUrl?: string | null;
  retryable?: boolean;
  payload?: Record<string, unknown>;
};

export type ManagedConversionFeedbackContext = {
  item: LeadConversionFeedbackOutboxItem;
  decision: LeadConversionDecision;
  destination: ProviderConversionDestination;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  nowMs: number;
};

export type ManagedConversionFeedbackAdapter = {
  key: ManagedConversionDestinationKey;
  label: string;
  deliver(args: ManagedConversionFeedbackContext): Promise<ManagedConversionFeedbackDeliveryResult>;
};
