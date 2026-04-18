import { z } from 'zod';
import { LEAD_EVENTS } from '../../../shared/lead-event-contract.js';
import { buildJourneyEvent } from '../_lead-core/services/journey-events.ts';
import { buildDefaultQualificationSnapshot } from '../_lead-core/services/qualification.ts';
import { deriveLeadRecordStatus } from '../_lead-core/services/outreach.ts';
import {
  toLeadAdminJourneySummary,
  toLeadAdminRecordSummary,
} from '../_lead-core/services/admin.ts';
import { createLeadCoreRuntime } from '../_lead-core/runtime.ts';
import type { LeadAdminDeps } from './types.ts';

const adminEnvSchema = z.object({
  LEADS_ADMIN_PASSWORD: z.string().trim().min(1),
});

export function createProductionLeadAdminDeps(env: NodeJS.ProcessEnv): LeadAdminDeps {
  const parsedEnv = adminEnvSchema.safeParse(env);
  const leadCoreRuntime = createLeadCoreRuntime(env);

  return {
    configValid: Boolean(
      parsedEnv.success && parsedEnv.data.LEADS_ADMIN_PASSWORD && leadCoreRuntime.configValid,
    ),
    adminPassword: parsedEnv.success ? parsedEnv.data.LEADS_ADMIN_PASSWORD : '',
    listLeadRecords: async ({ limit, qualifiedFilter, cursor }) => {
      const repos = leadCoreRuntime.repos;
      if (!repos) return { items: [] };

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

      return {
        items: result.items.map((leadRecord, index) =>
          toLeadAdminRecordSummary({
            leadRecord,
            contact: contacts[index] ?? null,
          }),
        ),
        lastEvaluatedKey: result.lastEvaluatedKey,
      };
    },
    listJourneys: async ({ limit, cursor }) => {
      const repos = leadCoreRuntime.repos;
      if (!repos) return { items: [] };
      const result = await repos.journeys.listPage({ limit, cursor });
      return {
        items: result.items.map((journey) => toLeadAdminJourneySummary(journey)),
        lastEvaluatedKey: result.lastEvaluatedKey,
      };
    },
    updateLeadRecordQualification: async ({ leadRecordId, qualified, qualifiedAtMs }) => {
      const repos = leadCoreRuntime.repos;
      if (!repos) return false;

      const existingLeadRecord = await repos.leadRecords.getById(leadRecordId);
      if (!existingLeadRecord) return false;

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

      return true;
    },
    nowEpochMs: () => Date.now(),
  };
}
