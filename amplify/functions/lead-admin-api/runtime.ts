import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { z } from 'zod';
import type {
  LeadFollowupSendStatus,
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../_lead-platform/domain/lead-followup-work.ts';
import { LEAD_EVENTS } from '@craigs/contracts/lead-event-contract';
import {
  parseManagedConversionDestinations,
  type ManagedConversionDestinationKey,
} from '@craigs/contracts/managed-conversion-contract';
import { buildJourneyEvent } from '../_lead-platform/services/journey-events.ts';
import {
  createManagedConversionDecisionForLead,
  suppressManagedConversionFeedbackForLead,
} from '../_lead-platform/services/managed-conversion-feedback.ts';
import { resolveProviderConversionDestinations } from '../_lead-platform/services/managed-conversion-destinations.ts';
import { buildDefaultQualificationSnapshot } from '../_lead-platform/services/qualification.ts';
import { deriveLeadRecordStatus } from '../_lead-platform/services/outreach.ts';
import {
  getLeadFollowupRetryBlockReason,
  toLeadAdminJourneySummary,
  toLeadAdminFollowupWorkSummary,
  toLeadAdminRecordSummary,
} from '../_lead-platform/services/admin.ts';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import type { LeadAdminDeps } from './types.ts';

const adminEnvSchema = z.object({
  LEAD_FOLLOWUP_WORKER_FUNCTION_NAME: z.string().trim().min(1),
  LEADS_ADMIN_PASSWORD: z.string().trim().min(1),
  MANAGED_CONVERSION_DESTINATIONS: z.string().optional(),
});

const OPERATIONAL_FOLLOWUP_STATUSES: LeadFollowupWorkStatus[] = ['error', 'processing', 'queued'];

function resolveManualSendStatus(status: LeadFollowupSendStatus): LeadFollowupSendStatus {
  return status === 'sent' ? 'sent' : 'skipped';
}

function resolveFollowupWorkManually(args: {
  nowEpochSeconds: number;
  reason: string;
  work: LeadFollowupWorkItem;
}): LeadFollowupWorkItem {
  return {
    ...args.work,
    status: 'completed',
    lease_id: undefined,
    lock_expires_at: undefined,
    updated_at: args.nowEpochSeconds,
    sms_status: resolveManualSendStatus(args.work.sms_status),
    email_status: resolveManualSendStatus(args.work.email_status),
    owner_email_status: resolveManualSendStatus(args.work.owner_email_status),
    outreach_result: args.work.outreach_result ?? 'manual_followup_required',
    operator_resolution: 'manual_followup',
    operator_resolution_reason: args.reason,
    operator_resolved_at: args.nowEpochSeconds,
  };
}

export function createProductionLeadAdminDeps(env: NodeJS.ProcessEnv): LeadAdminDeps {
  const parsedEnv = adminEnvSchema.safeParse(env);
  const lambda = parsedEnv.success ? new LambdaClient({}) : null;
  const leadPlatformRuntime = createLeadPlatformRuntime(env);
  const configuredConversionDestinations: ManagedConversionDestinationKey[] = parsedEnv.success
    ? parseManagedConversionDestinations(parsedEnv.data.MANAGED_CONVERSION_DESTINATIONS)
    : [];

  return {
    configValid: Boolean(
      parsedEnv.success &&
        parsedEnv.data.LEADS_ADMIN_PASSWORD &&
        Boolean(lambda) &&
        leadPlatformRuntime.configValid,
    ),
    adminPassword: parsedEnv.success ? parsedEnv.data.LEADS_ADMIN_PASSWORD : '',
    listLeadRecords: async ({ limit, qualifiedFilter, cursor }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return { items: [] };
      const conversionDestinations = await resolveProviderConversionDestinations({
        repo: repos.providerConversionDestinations,
        configuredDestinationKeys: configuredConversionDestinations,
        nowMs: Date.now(),
      });
      const resolvedDestinationKeys = conversionDestinations.map(
        (destination) => destination.destination_key,
      );

      const result = await repos.leadRecords.listPage({
        limit,
        qualifiedFilter,
        cursor,
      });

      const contacts = await Promise.all(
        result.items.map((leadRecord) =>
          leadRecord.contact_id
            ? repos.contacts.getById(leadRecord.contact_id)
            : Promise.resolve(null),
        ),
      );
      const conversionFeedbackItems = await Promise.all(
        result.items.map((leadRecord) =>
          repos.conversionFeedbackOutbox.listByLeadRecordId(leadRecord.lead_record_id),
        ),
      );
      const conversionDecisions = await Promise.all(
        result.items.map((leadRecord) =>
          repos.conversionDecisions.listByLeadRecordId(leadRecord.lead_record_id),
        ),
      );
      const conversionFeedbackOutcomes = await Promise.all(
        result.items.map((leadRecord) =>
          repos.conversionFeedbackOutcomes.listByLeadRecordId(leadRecord.lead_record_id),
        ),
      );

      return {
        items: result.items.map((leadRecord, index) =>
          toLeadAdminRecordSummary({
            leadRecord,
            contact: contacts[index] ?? null,
            configuredConversionDestinations: resolvedDestinationKeys,
            conversionDecisions: conversionDecisions[index] ?? [],
            conversionFeedbackOutboxItems: conversionFeedbackItems[index] ?? [],
            conversionFeedbackOutcomes: conversionFeedbackOutcomes[index] ?? [],
          }),
        ),
        lastEvaluatedKey: result.lastEvaluatedKey,
      };
    },
    listJourneys: async ({ limit, cursor }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return { items: [] };
      const result = await repos.journeys.listPage({ limit, cursor });
      return {
        items: result.items.map((journey) => toLeadAdminJourneySummary(journey)),
        lastEvaluatedKey: result.lastEvaluatedKey,
      };
    },
    listFollowupWork: async ({ limit, nowEpochSeconds }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return { items: [] };
      const results = await Promise.all(
        OPERATIONAL_FOLLOWUP_STATUSES.map((status) =>
          repos.followupWork.listByStatus(status, { limit }),
        ),
      );
      return {
        items: results
          .flat()
          .sort((a, b) => b.updated_at - a.updated_at)
          .slice(0, limit)
          .map((record) => toLeadAdminFollowupWorkSummary({ record, nowEpochSeconds })),
      };
    },
    retryFollowupWork: async ({ idempotencyKey, nowEpochSeconds }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return { ok: false, statusCode: 500, error: 'Lead platform unavailable' };
      const work = await repos.followupWork.getByIdempotencyKey(idempotencyKey);
      if (!work) return { ok: false, statusCode: 404, error: 'Follow-up work not found' };
      const blockReason = getLeadFollowupRetryBlockReason({ record: work, nowEpochSeconds });
      if (blockReason) return { ok: false, statusCode: 409, error: blockReason };
      if (!lambda || !parsedEnv.success) {
        return { ok: false, statusCode: 500, error: 'Follow-up worker unavailable' };
      }
      await lambda.send(
        new InvokeCommand({
          FunctionName: parsedEnv.data.LEAD_FOLLOWUP_WORKER_FUNCTION_NAME,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ idempotency_key: idempotencyKey })),
        }),
      );
      return { ok: true, invoked: true };
    },
    resolveFollowupWorkManually: async ({ idempotencyKey, nowEpochSeconds, reason }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return { ok: false, statusCode: 500, error: 'Lead platform unavailable' };
      const work = await repos.followupWork.getByIdempotencyKey(idempotencyKey);
      if (!work) return { ok: false, statusCode: 404, error: 'Follow-up work not found' };
      if (work.status === 'completed') {
        return { ok: false, statusCode: 409, error: 'already_completed' };
      }
      await repos.followupWork.put(resolveFollowupWorkManually({ work, nowEpochSeconds, reason }));
      return { ok: true };
    },
    updateLeadRecordQualification: async ({ leadRecordId, qualified, qualifiedAtMs }) => {
      const repos = leadPlatformRuntime.repos;
      if (!repos) return false;

      const existingLeadRecord = await repos.leadRecords.getById(leadRecordId);
      if (!existingLeadRecord) return false;
      if (existingLeadRecord.qualification.qualified === qualified) {
        if (qualified) {
          const contact = existingLeadRecord.contact_id
            ? await repos.contacts.getById(existingLeadRecord.contact_id)
            : null;
          const destinations = await resolveProviderConversionDestinations({
            repo: repos.providerConversionDestinations,
            configuredDestinationKeys: configuredConversionDestinations,
            nowMs: qualifiedAtMs,
            persistConfiguredDestinations: true,
          });
          await createManagedConversionDecisionForLead({
            repos,
            leadRecord: existingLeadRecord,
            contact,
            destinations,
            occurredAtMs: qualifiedAtMs,
            actor: 'admin',
          });
        }
        return true;
      }

      const qualification = buildDefaultQualificationSnapshot({
        ...existingLeadRecord.qualification,
        qualified,
        qualified_at_ms: qualified ? qualifiedAtMs : null,
      });

      const updatedLeadRecord = {
        ...existingLeadRecord,
        qualification,
        status: deriveLeadRecordStatus({
          qualification,
          latestOutreach: existingLeadRecord.latest_outreach,
        }),
        updated_at_ms: qualifiedAtMs,
      };

      await repos.leadRecords.put(updatedLeadRecord);
      await repos.journeyEvents.append(
        buildJourneyEvent({
          journeyId: existingLeadRecord.journey_id,
          leadRecordId,
          eventName: qualified ? LEAD_EVENTS.recordQualified : LEAD_EVENTS.recordUnqualified,
          occurredAtMs: qualifiedAtMs,
          recordedAtMs: qualifiedAtMs,
          actor: 'admin',
          discriminator: `${leadRecordId}:${qualified}:${qualifiedAtMs}`,
          payload: {
            qualified,
          },
        }),
      );

      const existingJourney = await repos.journeys.getById(existingLeadRecord.journey_id);
      if (existingJourney) {
        await repos.journeys.put({
          ...existingJourney,
          lead_record_id: leadRecordId,
          journey_status: qualified ? 'qualified' : 'captured',
          updated_at_ms: qualifiedAtMs,
        });
      }

      if (qualified) {
        const contact = updatedLeadRecord.contact_id
          ? await repos.contacts.getById(updatedLeadRecord.contact_id)
          : null;
        const destinations = await resolveProviderConversionDestinations({
          repo: repos.providerConversionDestinations,
          configuredDestinationKeys: configuredConversionDestinations,
          nowMs: qualifiedAtMs,
          persistConfiguredDestinations: true,
        });
        await createManagedConversionDecisionForLead({
          repos,
          leadRecord: updatedLeadRecord,
          contact,
          destinations,
          occurredAtMs: qualifiedAtMs,
          actor: 'admin',
        });
      } else {
        await suppressManagedConversionFeedbackForLead({
          repos,
          leadRecord: updatedLeadRecord,
          occurredAtMs: qualifiedAtMs,
          reason: 'Lead was unqualified by admin.',
        });
      }

      return true;
    },
    nowEpochMs: () => Date.now(),
  };
}
