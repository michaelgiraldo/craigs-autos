import type {
  LeadConversionDecision,
  LeadConversionFeedbackOutboxItem,
} from '../../../../domain/conversion-feedback.ts';
import type { LeadContact } from '../../../../domain/contact.ts';
import type { LeadRecord } from '../../../../domain/lead-record.ts';
import {
  hashNormalizedValue,
  normalizeBasicText,
  normalizeYelpName,
  normalizeYelpPhone,
} from '../../identity-normalization.ts';
import type { YelpEventName, YelpManagedConversionConfig } from './config.ts';

export type YelpConversionEventPayload = {
  event_id: string;
  event_time: number;
  event_name: YelpEventName;
  action_source: 'app' | 'physical_store' | 'website';
  user_data?: {
    em?: string[];
    ph?: string[];
    fn?: string;
    ln?: string;
    lead_id?: string;
    external_id?: string[];
  };
  custom_data: {
    order_id: string;
    value?: number;
    currency?: 'USD' | 'CAD';
    content_category?: string;
    event_labels?: Array<{ event_label: string; event_value: string }>;
  };
};

export type YelpConversionRequest = {
  event: YelpConversionEventPayload;
  test_event: boolean;
};

export type YelpPayloadBuildResult =
  | {
      ok: true;
      request: YelpConversionRequest;
      signalKeys: string[];
      warnings: string[];
    }
  | {
      ok: false;
      status: 'needs_signal';
      errorCode: string;
      message: string;
    };

function trimToNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mapYelpEventName(decision: LeadConversionDecision, config: YelpManagedConversionConfig) {
  if (decision.decision_type === 'completed_job') return 'purchase';
  if (decision.decision_type === 'booked_job') return 'custom_booked_job';
  if (decision.decision_type === 'lost_lead') return 'custom_lost_lead';
  if (decision.decision_type === 'spam') return 'custom_spam';
  if (decision.decision_type === 'not_a_fit') return 'custom_not_a_fit';
  return config.defaultEventName;
}

function buildUserData(args: { leadRecord: LeadRecord; contact: LeadContact | null }): {
  userData: YelpConversionEventPayload['user_data'];
  signalKeys: string[];
} {
  const userData: NonNullable<YelpConversionEventPayload['user_data']> = {};
  const signalKeys: string[] = [];
  const normalizedEmail = normalizeBasicText(
    args.contact?.normalized_email ?? args.contact?.raw_email,
  );
  const normalizedPhone = normalizeYelpPhone(
    args.contact?.normalized_phone ?? args.contact?.raw_phone,
  );
  const firstName = normalizeYelpName(args.contact?.first_name);
  const lastName = normalizeYelpName(args.contact?.last_name);
  const yelpLeadId = trimToNull(args.leadRecord.attribution?.yelp_lead_id);

  const hashedEmail = hashNormalizedValue(normalizedEmail);
  const hashedPhone = hashNormalizedValue(normalizedPhone);
  const hashedFirstName = hashNormalizedValue(firstName);
  const hashedLastName = hashNormalizedValue(lastName);

  if (hashedEmail) {
    userData.em = [hashedEmail];
    signalKeys.push('email');
  }
  if (hashedPhone) {
    userData.ph = [hashedPhone];
    signalKeys.push('phone');
  }
  if (hashedFirstName) userData.fn = hashedFirstName;
  if (hashedLastName) userData.ln = hashedLastName;
  if (yelpLeadId) {
    userData.lead_id = yelpLeadId;
    signalKeys.push('yelp_lead_id');
  }

  userData.external_id = [hashNormalizedValue(args.leadRecord.lead_record_id)].filter(
    (value): value is string => Boolean(value),
  );

  return {
    userData: Object.keys(userData).length ? userData : undefined,
    signalKeys,
  };
}

export function buildYelpConversionPayload(args: {
  config: YelpManagedConversionConfig;
  item: LeadConversionFeedbackOutboxItem;
  decision: LeadConversionDecision;
  leadRecord: LeadRecord;
  contact: LeadContact | null;
}): YelpPayloadBuildResult {
  const { userData, signalKeys } = buildUserData({
    leadRecord: args.leadRecord,
    contact: args.contact,
  });
  if (!signalKeys.length) {
    return {
      ok: false,
      status: 'needs_signal',
      errorCode: 'yelp_missing_signal',
      message:
        'Yelp conversion feedback requires a Yelp lead ID, hashed email, or hashed phone signal.',
    };
  }

  const eventName = mapYelpEventName(args.decision, args.config);
  const value = args.decision.conversion_value ?? null;
  const currency = args.decision.currency_code ?? args.config.currencyCode ?? null;
  const customData: YelpConversionEventPayload['custom_data'] = {
    order_id: args.item.outbox_id,
    content_category: args.leadRecord.service ?? undefined,
    event_labels: [
      { event_label: 'decision_type', event_value: args.decision.decision_type },
      { event_label: 'capture_channel', event_value: args.leadRecord.capture_channel },
    ],
  };
  if (eventName === 'purchase' && typeof value === 'number' && value >= 0) {
    customData.value = value;
    if (currency === 'USD' || currency === 'CAD') customData.currency = currency;
  }

  return {
    ok: true,
    signalKeys,
    warnings: [],
    request: {
      event: {
        event_id: args.item.outbox_id,
        event_time: Math.floor(args.decision.occurred_at_ms / 1000),
        event_name: eventName,
        action_source: args.config.actionSource,
        user_data: userData,
        custom_data: customData,
      },
      test_event: args.config.mode === 'test',
    },
  };
}
