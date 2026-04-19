import { createHash } from 'node:crypto';
import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
  ProviderConversionDestination,
} from '../domain/conversion-feedback.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { LeadRecord } from '../domain/lead-record.ts';
import type {
  ManagedConversionFeedbackAdapter,
  ManagedConversionFeedbackDeliveryResult,
} from './managed-conversion-feedback-worker.ts';

export type GoogleAdsManagedConversionMode = 'dry_run' | 'validate_only' | 'live';
export type GoogleAdsConsentStatus = 'GRANTED' | 'DENIED';

export type GoogleAdsManagedConversionConfig = {
  mode: GoogleAdsManagedConversionMode;
  customerId: string | null;
  conversionActionResourceName: string | null;
  conversionActionId: string | null;
  defaultConversionValue: number | null;
  currencyCode: string | null;
  adUserDataConsent: GoogleAdsConsentStatus | null;
  accountDefaultConsentConfigured: boolean;
};

export type GoogleAdsClickConversionPayload = {
  conversion_action: string;
  conversion_date_time: string;
  conversion_environment: 'WEB';
  order_id: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  user_identifiers?: Array<{
    hashed_email?: string;
    hashed_phone_number?: string;
  }>;
  conversion_value?: number;
  currency_code?: string;
  consent?: {
    ad_user_data: GoogleAdsConsentStatus;
  };
};

export type GoogleAdsUploadClickConversionsPayload = {
  customer_id: string;
  partial_failure: true;
  validate_only: boolean;
  conversions: GoogleAdsClickConversionPayload[];
};

export type GoogleAdsPayloadBuildResult =
  | {
      ok: true;
      payload: GoogleAdsUploadClickConversionsPayload;
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

function parseBoolean(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function parseMode(value: unknown): GoogleAdsManagedConversionMode {
  const normalized = trimToNull(value)?.toLowerCase();
  return normalized === 'validate_only' || normalized === 'live' ? normalized : 'dry_run';
}

function parseConsent(value: unknown): GoogleAdsConsentStatus | null {
  const normalized = trimToNull(value)?.toUpperCase();
  return normalized === 'GRANTED' || normalized === 'DENIED' ? normalized : null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeCustomerId(value: unknown): string | null {
  const normalized = trimToNull(value)?.replaceAll('-', '') ?? null;
  return normalized && /^\d+$/.test(normalized) ? normalized : null;
}

function normalizeCurrencyCode(value: unknown): string | null {
  const normalized = trimToNull(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function buildConversionActionResourceName(args: {
  customerId: string | null;
  conversionActionResourceName: string | null;
  conversionActionId: string | null;
}): string | null {
  if (args.conversionActionResourceName) return args.conversionActionResourceName;
  if (!args.customerId || !args.conversionActionId) return null;
  return `customers/${args.customerId}/conversionActions/${args.conversionActionId}`;
}

export function parseGoogleAdsManagedConversionConfig(
  env: Record<string, string | undefined>,
): GoogleAdsManagedConversionConfig {
  return {
    mode: parseMode(env.GOOGLE_ADS_CONVERSION_FEEDBACK_MODE),
    customerId: normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID),
    conversionActionResourceName: trimToNull(env.GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME),
    conversionActionId: normalizeCustomerId(env.GOOGLE_ADS_CONVERSION_ACTION_ID),
    defaultConversionValue: parseNumber(env.GOOGLE_ADS_DEFAULT_CONVERSION_VALUE),
    currencyCode: normalizeCurrencyCode(env.GOOGLE_ADS_CURRENCY_CODE),
    adUserDataConsent: parseConsent(env.GOOGLE_ADS_AD_USER_DATA_CONSENT),
    accountDefaultConsentConfigured: parseBoolean(
      env.GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED,
    ),
  };
}

export function normalizeGoogleAdsUserValue(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized ? normalized : null;
}

export function hashGoogleAdsUserValue(value: string | null | undefined): string | null {
  const normalized = normalizeGoogleAdsUserValue(value);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
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

function buildUserIdentifiers(
  contact: LeadContact | null,
): GoogleAdsClickConversionPayload['user_identifiers'] {
  const identifiers: NonNullable<GoogleAdsClickConversionPayload['user_identifiers']> = [];
  const hashedEmail = hashGoogleAdsUserValue(contact?.normalized_email ?? contact?.raw_email);
  const hashedPhone = hashGoogleAdsUserValue(contact?.normalized_phone ?? contact?.raw_phone);

  if (hashedEmail) identifiers.push({ hashed_email: hashedEmail });
  if (hashedPhone) identifiers.push({ hashed_phone_number: hashedPhone });
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
  userIdentifiers: GoogleAdsClickConversionPayload['user_identifiers'];
}): string[] {
  const signals = [
    readClickSignal(args.leadRecord, 'gclid') ? 'gclid' : null,
    readClickSignal(args.leadRecord, 'gbraid') ? 'gbraid' : null,
    readClickSignal(args.leadRecord, 'wbraid') ? 'wbraid' : null,
    args.userIdentifiers?.some((identifier) => identifier.hashed_email) ? 'email' : null,
    args.userIdentifiers?.some((identifier) => identifier.hashed_phone_number) ? 'phone' : null,
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
  const customerId = args.config.customerId;
  const conversionAction = buildConversionActionResourceName({
    customerId,
    conversionActionResourceName: args.config.conversionActionResourceName,
    conversionActionId: args.config.conversionActionId,
  });
  const missingConfigKeys = [
    customerId ? null : 'GOOGLE_ADS_CUSTOMER_ID',
    conversionAction
      ? null
      : 'GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME or GOOGLE_ADS_CONVERSION_ACTION_ID',
    args.config.adUserDataConsent || args.config.accountDefaultConsentConfigured
      ? null
      : 'GOOGLE_ADS_AD_USER_DATA_CONSENT or GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED',
  ].filter((value): value is string => Boolean(value));

  if (missingConfigKeys.length || !customerId || !conversionAction) {
    return {
      ok: false,
      status: 'needs_destination_config',
      errorCode: 'google_ads_missing_config',
      message: `Google Ads conversion feedback is missing required dry-run configuration: ${missingConfigKeys.join(', ')}.`,
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
    conversion_action: conversionAction,
    conversion_date_time: formatGoogleAdsDateTime(args.decision.occurred_at_ms),
    conversion_environment: 'WEB',
    order_id: args.item.outbox_id,
  };
  const gclid = readClickSignal(args.leadRecord, 'gclid');
  const gbraid = readClickSignal(args.leadRecord, 'gbraid');
  const wbraid = readClickSignal(args.leadRecord, 'wbraid');
  if (gclid) conversion.gclid = gclid;
  if (gbraid) conversion.gbraid = gbraid;
  if (wbraid) conversion.wbraid = wbraid;
  if (userIdentifiers) conversion.user_identifiers = userIdentifiers;
  if (typeof conversionValue === 'number') conversion.conversion_value = conversionValue;
  if (typeof conversionValue === 'number' && currencyCode) conversion.currency_code = currencyCode;
  if (args.config.adUserDataConsent) {
    conversion.consent = {
      ad_user_data: args.config.adUserDataConsent,
    };
  }

  return {
    ok: true,
    signalKeys,
    warnings:
      args.config.adUserDataConsent || args.config.accountDefaultConsentConfigured
        ? []
        : ['Google Ads consent is not explicitly configured.'],
    payload: {
      customer_id: customerId,
      partial_failure: true,
      validate_only: args.config.mode === 'validate_only',
      conversions: [conversion],
    },
  };
}

export function createGoogleAdsManagedConversionAdapter(
  config: GoogleAdsManagedConversionConfig,
): ManagedConversionFeedbackAdapter {
  return {
    canHandle(destination: ProviderConversionDestination) {
      return destination.destination_key === 'google_ads';
    },
    async deliver({ item, decision, leadRecord, contact }) {
      const result = buildGoogleAdsUploadClickConversionsPayload({
        config,
        item,
        decision,
        leadRecord,
        contact,
      });

      if (!result.ok) {
        return {
          status: result.status,
          message: result.message,
          errorCode: result.errorCode,
          payload: {
            missing_config_keys: result.missingConfigKeys ?? [],
          },
        };
      }

      if (config.mode !== 'dry_run') {
        return {
          status: 'needs_destination_config',
          message:
            'Google Ads live and validate_only uploads are intentionally disabled in this dry-safe adapter slice.',
          errorCode: 'google_ads_live_upload_not_enabled',
          payload: {
            mode: config.mode,
            request: result.payload,
          },
        };
      }

      const conversion = result.payload.conversions[0];
      return {
        status: 'validated',
        message:
          'Google Ads ClickConversion payload validated in dry-run mode; no provider API was called.',
        payload: {
          mode: config.mode,
          signal_keys: result.signalKeys,
          warnings: result.warnings,
          request: result.payload,
          user_identifier_count: conversion.user_identifiers?.length ?? 0,
          has_click_id: Boolean(conversion.gclid || conversion.gbraid || conversion.wbraid),
        },
      } satisfies ManagedConversionFeedbackDeliveryResult;
    },
  };
}
