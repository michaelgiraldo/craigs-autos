import { z } from 'zod';
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
  toLeadAdminJourneySummary,
  toLeadAdminRecordSummary,
} from '../_lead-platform/services/admin.ts';
import { createLeadPlatformRuntime } from '../_lead-platform/runtime.ts';
import type { LeadAdminDeps } from './types.ts';

const adminEnvSchema = z.object({
  LEADS_ADMIN_PASSWORD: z.string().trim().min(1),
  MANAGED_CONVERSION_DESTINATIONS: z.string().optional(),
});

export function createProductionLeadAdminDeps(env: NodeJS.ProcessEnv): LeadAdminDeps {
  const parsedEnv = adminEnvSchema.safeParse(env);
  const leadPlatformRuntime = createLeadPlatformRuntime(env);
  const configuredConversionDestinations: ManagedConversionDestinationKey[] = parsedEnv.success
    ? parseManagedConversionDestinations(parsedEnv.data.MANAGED_CONVERSION_DESTINATIONS)
    : [];

  return {
    configValid: Boolean(
      parsedEnv.success && parsedEnv.data.LEADS_ADMIN_PASSWORD && leadPlatformRuntime.configValid,
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
