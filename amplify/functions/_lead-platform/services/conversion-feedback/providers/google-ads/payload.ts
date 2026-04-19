import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
} from '../../../../domain/conversion-feedback.ts';
import type { LeadContact } from '../../../../domain/contact.ts';
import type { LeadRecord } from '../../../../domain/lead-record.ts';
import { hashGoogleEnhancedEmail, hashGooglePhone } from '../../identity-normalization.ts';
import {
  buildGoogleAdsConversionActionResourceName,
  getGoogleAdsMissingDryRunConfigKeys,
  type GoogleAdsConsentStatus,
  type GoogleAdsManagedConversionConfig,
} from './config.ts';

export type GoogleAdsUserIdentifier = {
  hashedEmail?: string;
  hashedPhoneNumber?: string;
};

export type GoogleAdsClickConversionPayload = {
  conversionAction: string;
  conversionDateTime: string;
  conversionEnvironment: 'WEB';
  orderId: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  userIdentifiers?: GoogleAdsUserIdentifier[];
  conversionValue?: number;
  currencyCode?: string;
  consent?: {
    adUserData: GoogleAdsConsentStatus;
  };
};

export type GoogleAdsUploadClickConversionsRequest = {
  customerId: string;
  body: {
    conversions: GoogleAdsClickConversionPayload[];
    partialFailure: true;
    validateOnly: boolean;
  };
};

export type GoogleAdsPayloadBuildResult =
  | {
      ok: true;
      request: GoogleAdsUploadClickConversionsRequest;
      signalKeys: string[];
      warnings: string[];
    }
  | {
      ok: false;
      status: 'needs_destination_config' | 'needs_signal';
      errorCode: string;
      message: string;
      missingConfigKeys?: string[];
    };

function trimToNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatGoogleAdsDateTime(ms: number): string {
  const date = new Date(ms);
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}+00:00`;
}

function buildUserIdentifiers(contact: LeadContact | null): GoogleAdsUserIdentifier[] | undefined {
  const identifiers: GoogleAdsUserIdentifier[] = [];
  const hashedEmail = hashGoogleEnhancedEmail(contact?.normalized_email ?? contact?.raw_email);
  const hashedPhone = hashGooglePhone(contact?.normalized_phone ?? contact?.raw_phone);

  if (hashedEmail) identifiers.push({ hashedEmail });
  if (hashedPhone) identifiers.push({ hashedPhoneNumber: hashedPhone });
  return identifiers.length ? identifiers : undefined;
}

function readClickSignal(
  leadRecord: LeadRecord,
  key: 'gclid' | 'gbraid' | 'wbraid',
): string | null {
  return trimToNull(leadRecord.attribution?.[key]);
}

function buildSignalKeys(args: {
  leadRecord: LeadRecord;
  userIdentifiers: GoogleAdsUserIdentifier[] | undefined;
}): string[] {
  const signals = [
    readClickSignal(args.leadRecord, 'gclid') ? 'gclid' : null,
    readClickSignal(args.leadRecord, 'gbraid') ? 'gbraid' : null,
    readClickSignal(args.leadRecord, 'wbraid') ? 'wbraid' : null,
    args.userIdentifiers?.some((identifier) => identifier.hashedEmail) ? 'email' : null,
    args.userIdentifiers?.some((identifier) => identifier.hashedPhoneNumber) ? 'phone' : null,
  ];
  return signals.filter((value): value is string => Boolean(value));
}

export function buildGoogleAdsUploadClickConversionsPayload(args: {
  config: GoogleAdsManagedConversionConfig;
  item: LeadConversionFeedbackOutboxItem;
  decision: LeadConversionDecision;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
}): GoogleAdsPayloadBuildResult {
  const conversionAction = buildGoogleAdsConversionActionResourceName({
    customerId: args.config.customerId,
    conversionActionResourceName: args.config.conversionActionResourceName,
    conversionActionId: args.config.conversionActionId,
  });
  const missingConfigKeys = getGoogleAdsMissingDryRunConfigKeys(args.config);

  if (missingConfigKeys.length || !args.config.customerId || !conversionAction) {
    return {
      ok: false,
      status: 'needs_destination_config',
      errorCode: 'google_ads_missing_config',
      message: `Google Ads conversion feedback is missing required configuration: ${missingConfigKeys.join(', ')}.`,
      missingConfigKeys,
    };
  }

  const userIdentifiers = buildUserIdentifiers(args.contact);
  const signalKeys = buildSignalKeys({ leadRecord: args.leadRecord, userIdentifiers });
  if (!signalKeys.length) {
    return {
      ok: false,
      status: 'needs_signal',
      errorCode: 'google_ads_missing_signal',
      message:
        'Google Ads conversion feedback requires a GCLID, GBRAID, WBRAID, hashed email, or hashed phone signal.',
    };
  }

  const conversionValue =
    args.decision.conversion_value ?? args.config.defaultConversionValue ?? null;
  const currencyCode = args.decision.currency_code ?? args.config.currencyCode ?? null;
  const conversion: GoogleAdsClickConversionPayload = {
    conversionAction,
    conversionDateTime: formatGoogleAdsDateTime(args.decision.occurred_at_ms),
    conversionEnvironment: 'WEB',
    orderId: args.item.outbox_id,
  };
  const gclid = readClickSignal(args.leadRecord, 'gclid');
  const gbraid = readClickSignal(args.leadRecord, 'gbraid');
  const wbraid = readClickSignal(args.leadRecord, 'wbraid');
  if (gclid) conversion.gclid = gclid;
  if (gbraid) conversion.gbraid = gbraid;
  if (wbraid) conversion.wbraid = wbraid;
  if (userIdentifiers) conversion.userIdentifiers = userIdentifiers;
  if (typeof conversionValue === 'number') conversion.conversionValue = conversionValue;
  if (typeof conversionValue === 'number' && currencyCode) conversion.currencyCode = currencyCode;
  if (args.config.adUserDataConsent) {
    conversion.consent = {
      adUserData: args.config.adUserDataConsent,
    };
  }

  return {
    ok: true,
    signalKeys,
    warnings:
      args.config.adUserDataConsent || args.config.accountDefaultConsentConfigured
        ? []
        : ['Google Ads consent is not explicitly configured.'],
    request: {
      customerId: args.config.customerId,
      body: {
        partialFailure: true,
        validateOnly: args.config.mode === 'test',
        conversions: [conversion],
      },
    },
  };
}
