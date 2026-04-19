import { z } from 'zod';
import {
  LEAD_INTERACTION_EVENT_NAMES,
  isLeadInteractionEventName,
} from '@craigs/contracts/lead-event-contract';
import { mergeAttributionSnapshot } from '../_lead-platform/domain/attribution.ts';
import type { Journey } from '../_lead-platform/domain/journey.ts';
import type { JourneyEvent } from '../_lead-platform/domain/journey-event.ts';
import { dedupeStrings } from '../_lead-platform/domain/normalize.ts';
import { buildJourneyInteraction } from '../_lead-platform/services/record-interaction.ts';
import { applyJourneyStatusTransition } from '../_lead-platform/services/journey-status.ts';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import type { AllowedLeadInteractionEvent, LeadInteractionRequest } from './types.ts';

const allowedEventSchema = z.enum(LEAD_INTERACTION_EVENT_NAMES);

const leadInteractionPayloadSchema = z.looseObject({
  event: z.string(),
  journey_id: z.string().nullable().optional(),
  client_event_id: z.string().nullable().optional(),
  occurred_at_ms: z.number().nullable().optional(),
  pageUrl: z.string().nullable().optional(),
  pagePath: z.string().nullable().optional(),
  user: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  threadId: z.string().nullable().optional(),
  clickUrl: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  attribution: z.unknown().optional(),
});

type LambdaEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type LeadInteractionCaptureDeps = {
  configValid: boolean;
  nowEpochMs: () => number;
  getJourney: (journeyId: string) => Promise<Journey | null>;
  getEvent: (journeyId: string, eventSortKey: string) => Promise<JourneyEvent | null>;
  putJourney: (journey: Journey) => Promise<void>;
  putEvent: (event: JourneyEvent) => Promise<void>;
};

function mergeJourney(current: Journey | null, incoming: Journey): Journey {
  if (!current) return incoming;
  const actionTypes = dedupeStrings([
    ...current.action_types,
    ...incoming.action_types,
  ]) as Journey['action_types'];
  const transition = applyJourneyStatusTransition({
    currentStatus: current.journey_status,
    currentReason: current.status_reason,
    incomingStatus: incoming.journey_status,
    incomingReason: incoming.status_reason,
  });
  return {
    ...current,
    lead_record_id: incoming.lead_record_id ?? current.lead_record_id,
    contact_id: incoming.contact_id ?? current.contact_id,
    journey_status: transition.journeyStatus ?? current.journey_status,
    status_reason: transition.statusReason,
    capture_channel: current.capture_channel ?? incoming.capture_channel,
    first_action: current.first_action ?? incoming.first_action,
    latest_action: incoming.latest_action ?? current.latest_action,
    action_types: actionTypes,
    action_count: Math.max(current.action_count, incoming.action_count, actionTypes.length),
    lead_user_id: current.lead_user_id ?? incoming.lead_user_id,
    thread_id: current.thread_id ?? incoming.thread_id,
    locale: current.locale ?? incoming.locale,
    page_url: current.page_url ?? incoming.page_url,
    page_path: current.page_path ?? incoming.page_path,
    origin: current.origin ?? incoming.origin,
    site_label: current.site_label ?? incoming.site_label,
    attribution: current.attribution ?? incoming.attribution,
    created_at_ms: Math.min(current.created_at_ms, incoming.created_at_ms),
    updated_at_ms: Math.max(current.updated_at_ms, incoming.updated_at_ms),
  };
}

function json(statusCode: number, body: unknown): LambdaResult {
  return jsonResponse(statusCode, body);
}

export function createLeadInteractionCaptureHandler(deps: LeadInteractionCaptureDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    if (!deps.configValid) {
      return json(500, { error: 'Server missing configuration' });
    }

    let payload: LeadInteractionRequest = { event: '' };
    try {
      const body = decodeBody(event);
      const parsed = body ? JSON.parse(body) : {};
      const result = leadInteractionPayloadSchema.safeParse(
        parsed && typeof parsed === 'object' ? parsed : {},
      );
      if (!result.success) return json(400, { error: 'Invalid request payload' });
      payload = result.data;
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const eventNameResult = allowedEventSchema.safeParse(payload.event);
    if (!eventNameResult.success || !isLeadInteractionEventName(eventNameResult.data)) {
      return json(400, { error: 'Invalid event' });
    }

    const eventName: AllowedLeadInteractionEvent = eventNameResult.data;
    const nowMs = deps.nowEpochMs();
    const occurredAtMs =
      typeof payload.occurred_at_ms === 'number' && Number.isFinite(payload.occurred_at_ms)
        ? payload.occurred_at_ms
        : nowMs;

    const { journey, event: interactionEvent } = buildJourneyInteraction({
      eventName,
      occurredAtMs,
      recordedAtMs: nowMs,
      providedJourneyId: typeof payload.journey_id === 'string' ? payload.journey_id : null,
      clientEventId: typeof payload.client_event_id === 'string' ? payload.client_event_id : null,
      userId: typeof payload.user === 'string' ? payload.user : null,
      threadId: typeof payload.threadId === 'string' ? payload.threadId : null,
      pageUrl: typeof payload.pageUrl === 'string' ? payload.pageUrl : null,
      pagePath: typeof payload.pagePath === 'string' ? payload.pagePath : null,
      clickUrl: typeof payload.clickUrl === 'string' ? payload.clickUrl : null,
      locale: typeof payload.locale === 'string' ? payload.locale : null,
      provider: typeof payload.provider === 'string' ? payload.provider : null,
      attribution: mergeAttributionSnapshot(payload.attribution, payload.pageUrl, payload.clickUrl),
    });

    const existingEvent = await deps.getEvent(
      interactionEvent.journey_id,
      interactionEvent.event_sort_key,
    );
    const existingJourney = await deps.getJourney(interactionEvent.journey_id);

    if (!existingEvent) {
      await deps.putEvent(interactionEvent);
    }

    await deps.putJourney(mergeJourney(existingJourney, journey));

    return json(200, {
      ok: true,
      journey_id: interactionEvent.journey_id,
      journey_event_id: interactionEvent.journey_event_id,
      recorded: !existingEvent,
    });
  };
}

const leadPlatformRuntime = createLeadPlatformRuntime(process.env);

export const handler = createLeadInteractionCaptureHandler({
  configValid: Boolean(leadPlatformRuntime.configValid),
  nowEpochMs: () => Date.now(),
  getJourney: async (journeyId) => {
    const repos = leadPlatformRuntime.repos;
    if (!repos) return null;
    return repos.journeys.getById(journeyId);
  },
  getEvent: async (journeyId, eventSortKey) => {
    const repos = leadPlatformRuntime.repos;
    if (!repos) return null;
    return repos.journeyEvents.getBySortKey(journeyId, eventSortKey);
  },
  putJourney: async (journey) => {
    const repos = leadPlatformRuntime.repos;
    if (!repos) return;
    await repos.journeys.put(journey);
  },
  putEvent: async (interactionEvent) => {
    const repos = leadPlatformRuntime.repos;
    if (!repos) return;
    await repos.journeyEvents.append(interactionEvent);
  },
});
