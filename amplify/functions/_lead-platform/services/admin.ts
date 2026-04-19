import {
  summarizeManagedConversionFeedback,
  type ManagedConversionDestinationKey,
  type ManagedConversionFeedbackSummary,
} from '@craigs/contracts/managed-conversion-contract';
import type { DeviceType } from '../domain/attribution.ts';
import type { LeadContact } from '../domain/contact.ts';
import type { Journey } from '../domain/journey.ts';
import type { LeadRecord } from '../domain/lead-record.ts';

export type LeadAdminRecordSummary = {
  lead_record_id: string;
  journey_id: string;
  status: LeadRecord['status'];
  capture_channel: LeadRecord['capture_channel'];
  title: string;
  display_name: string | null;
  normalized_phone: string | null;
  normalized_email: string | null;
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer_host: string | null;
  click_id_type: string | null;
  click_id: string | null;
  qualified: boolean;
  conversion_feedback: ManagedConversionFeedbackSummary;
  outreach_channel: LeadRecord['latest_outreach']['channel'];
  outreach_status: LeadRecord['latest_outreach']['status'];
  first_action: LeadRecord['first_action'];
  latest_action: LeadRecord['latest_action'];
  action_types: LeadRecord['action_types'];
  action_count: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type LeadAdminJourneySummary = {
  journey_id: string;
  lead_record_id: string | null;
  journey_status: Journey['journey_status'];
  status_reason: string | null;
  capture_channel: Journey['capture_channel'];
  first_action: Journey['first_action'];
  latest_action: Journey['latest_action'];
  action_types: Journey['action_types'];
  action_count: number;
  thread_id: string | null;
  lead_user_id: string | null;
  device_type: DeviceType | null;
  source_platform: string | null;
  acquisition_class: string | null;
  landing_page: string | null;
  referrer_host: string | null;
  created_at_ms: number;
  updated_at_ms: number;
};

function pickClickId(record: { attribution: LeadRecord['attribution'] | Journey['attribution'] }) {
  return (
    record.attribution?.gclid ??
    record.attribution?.gbraid ??
    record.attribution?.wbraid ??
    record.attribution?.msclkid ??
    record.attribution?.fbclid ??
    record.attribution?.ttclid ??
    record.attribution?.li_fat_id ??
    record.attribution?.epik ??
    record.attribution?.sc_click_id ??
    record.attribution?.yelp_lead_id ??
    null
  );
}

export function toLeadAdminRecordSummary(args: {
  leadRecord: LeadRecord;
  contact: LeadContact | null;
  configuredConversionDestinations?: ManagedConversionDestinationKey[];
}): LeadAdminRecordSummary {
  return {
    lead_record_id: args.leadRecord.lead_record_id,
    journey_id: args.leadRecord.journey_id,
    status: args.leadRecord.status,
    capture_channel: args.leadRecord.capture_channel,
    title: args.leadRecord.title,
    display_name: args.contact?.display_name ?? null,
    normalized_phone: args.contact?.normalized_phone ?? null,
    normalized_email: args.contact?.normalized_email ?? null,
    device_type: args.leadRecord.attribution?.device_type ?? null,
    source_platform: args.leadRecord.attribution?.source_platform ?? null,
    acquisition_class: args.leadRecord.attribution?.acquisition_class ?? null,
    utm_source: args.leadRecord.attribution?.utm_source ?? null,
    utm_medium: args.leadRecord.attribution?.utm_medium ?? null,
    utm_campaign: args.leadRecord.attribution?.utm_campaign ?? null,
    utm_term: args.leadRecord.attribution?.utm_term ?? null,
    utm_content: args.leadRecord.attribution?.utm_content ?? null,
    landing_page: args.leadRecord.attribution?.landing_page ?? null,
    referrer_host: args.leadRecord.attribution?.referrer_host ?? null,
    click_id_type: args.leadRecord.attribution?.click_id_type ?? null,
    click_id: pickClickId(args.leadRecord),
    qualified: args.leadRecord.qualification.qualified,
    conversion_feedback: summarizeManagedConversionFeedback({
      qualified: args.leadRecord.qualification.qualified,
      attribution: args.leadRecord.attribution,
      contact: args.contact,
      configuredDestinationKeys: args.configuredConversionDestinations ?? [],
    }),
    outreach_channel: args.leadRecord.latest_outreach.channel,
    outreach_status: args.leadRecord.latest_outreach.status,
    first_action: args.leadRecord.first_action,
    latest_action: args.leadRecord.latest_action,
    action_types: args.leadRecord.action_types,
    action_count: args.leadRecord.action_count,
    created_at_ms: args.leadRecord.created_at_ms,
    updated_at_ms: args.leadRecord.updated_at_ms,
  };
}

export function toLeadAdminJourneySummary(journey: Journey): LeadAdminJourneySummary {
  return {
    journey_id: journey.journey_id,
    lead_record_id: journey.lead_record_id,
    journey_status: journey.journey_status,
    status_reason: journey.status_reason,
    capture_channel: journey.capture_channel,
    first_action: journey.first_action,
    latest_action: journey.latest_action,
    action_types: journey.action_types,
    action_count: journey.action_count,
    thread_id: journey.thread_id,
    lead_user_id: journey.lead_user_id,
    device_type: journey.attribution?.device_type ?? null,
    source_platform: journey.attribution?.source_platform ?? null,
    acquisition_class: journey.attribution?.acquisition_class ?? null,
    landing_page: journey.attribution?.landing_page ?? null,
    referrer_host: journey.attribution?.referrer_host ?? null,
    created_at_ms: journey.created_at_ms,
    updated_at_ms: journey.updated_at_ms,
  };
}
