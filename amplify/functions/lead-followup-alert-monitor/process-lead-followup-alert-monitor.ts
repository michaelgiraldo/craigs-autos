import { getErrorDetails } from '../_shared/safe.ts';
import type {
  LeadFollowupFailureAlertKind,
  LeadFollowupWorkItem,
  LeadFollowupWorkStatus,
} from '../_lead-platform/domain/lead-followup-work.ts';
import {
  classifyLeadFollowupAlertKind,
  isLeadFollowupFailureAlertCoolingDown,
  isLeadFollowupFailureAlertSent,
} from '../_lead-platform/services/followup-work-alerts.ts';

export const DEFAULT_LEAD_FAILURE_ALERT_BATCH_SIZE = 25;
export const DEFAULT_LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS = 60 * 60;
export const LEAD_FAILURE_ALERT_PROCESSING_QUERY_LIMIT = 100;

export type LeadFollowupAlertMonitorItemResult = {
  alertKind: Exclude<LeadFollowupFailureAlertKind, null> | null;
  error?: string | null;
  idempotencyKey: string;
  result:
    | 'not_found'
    | 'sent'
    | 'send_failed'
    | 'skipped_already_sent'
    | 'skipped_cooling_down'
    | 'skipped_not_alertable'
    | 'state_changed';
};

export type LeadFollowupAlertMonitorResult = {
  checked: number;
  sendFailed: number;
  sent: number;
  stateChanged: number;
  items: LeadFollowupAlertMonitorItemResult[];
};

export type LeadFollowupAlertMonitorDeps = {
  batchSize: number;
  configValid: boolean;
  getFollowupWork: (idempotencyKey: string) => Promise<LeadFollowupWorkItem | null>;
  listFollowupWorkByStatus: (
    status: LeadFollowupWorkStatus,
    options?: {
      limit?: number;
      scanIndexForward?: boolean;
      updatedAtLte?: number;
    },
  ) => Promise<LeadFollowupWorkItem[]>;
  minIntervalSeconds: number;
  nowEpochSeconds: () => number;
  sendFailureAlertEmail: (args: {
    alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
    record: LeadFollowupWorkItem;
  }) => Promise<{ messageId: string }>;
  updateFailureAlertState: (args: {
    alertError?: string | null;
    alertKind: Exclude<LeadFollowupFailureAlertKind, null>;
    alertMessageId?: string | null;
    alertSentAt?: number;
    alertStatus: 'sent' | 'failed';
    expectedStatus: LeadFollowupWorkStatus;
    expectedUpdatedAt: number;
    idempotencyKey: string;
    lastAttemptAt: number;
  }) => Promise<boolean>;
};

function normalizeBatchSize(batchSize: number | undefined, fallback: number): number {
  return Number.isInteger(batchSize) && Number(batchSize) > 0 ? Number(batchSize) : fallback;
}

async function collectAlertCandidates(args: {
  batchSize: number;
  deps: LeadFollowupAlertMonitorDeps;
  idempotencyKey?: string | null;
  nowEpochSeconds: number;
}): Promise<LeadFollowupWorkItem[]> {
  if (args.idempotencyKey) {
    const record = await args.deps.getFollowupWork(args.idempotencyKey);
    return record ? [record] : [];
  }

  const records: LeadFollowupWorkItem[] = [];
  const seen = new Set<string>();
  const addRecords = (items: LeadFollowupWorkItem[]) => {
    for (const item of items) {
      if (seen.has(item.idempotency_key)) continue;
      seen.add(item.idempotency_key);
      records.push(item);
      if (records.length >= args.batchSize) return;
    }
  };

  addRecords(
    await args.deps.listFollowupWorkByStatus('error', {
      limit: args.batchSize,
      scanIndexForward: false,
    }),
  );
  if (records.length >= args.batchSize) return records;

  addRecords(
    await args.deps.listFollowupWorkByStatus('queued', {
      limit: args.batchSize,
      scanIndexForward: false,
      updatedAtLte: args.nowEpochSeconds - 10 * 60,
    }),
  );
  if (records.length >= args.batchSize) return records;

  const processingRecords = await args.deps.listFollowupWorkByStatus('processing', {
    limit: LEAD_FAILURE_ALERT_PROCESSING_QUERY_LIMIT,
    scanIndexForward: false,
  });
  addRecords(
    processingRecords.filter((record) => (record.lock_expires_at ?? 0) <= args.nowEpochSeconds),
  );

  return records.slice(0, args.batchSize);
}

export async function processLeadFollowupAlertMonitor(args: {
  batchSize?: number;
  deps: LeadFollowupAlertMonitorDeps;
  idempotencyKey?: string | null;
}): Promise<LeadFollowupAlertMonitorResult> {
  const batchSize = normalizeBatchSize(args.batchSize, args.deps.batchSize);
  const nowEpochSeconds = args.deps.nowEpochSeconds();
  const records = await collectAlertCandidates({
    batchSize,
    deps: args.deps,
    idempotencyKey: args.idempotencyKey ?? null,
    nowEpochSeconds,
  });

  if (args.idempotencyKey && records.length === 0) {
    return {
      checked: 0,
      sendFailed: 0,
      sent: 0,
      stateChanged: 0,
      items: [
        {
          alertKind: null,
          idempotencyKey: args.idempotencyKey,
          result: 'not_found',
        },
      ],
    };
  }

  const result: LeadFollowupAlertMonitorResult = {
    checked: 0,
    sendFailed: 0,
    sent: 0,
    stateChanged: 0,
    items: [],
  };

  for (const record of records) {
    result.checked += 1;
    const alertKind = classifyLeadFollowupAlertKind({ nowEpochSeconds, record });
    if (!alertKind) {
      result.items.push({
        alertKind: null,
        idempotencyKey: record.idempotency_key,
        result: 'skipped_not_alertable',
      });
      continue;
    }
    if (isLeadFollowupFailureAlertSent(record)) {
      result.items.push({
        alertKind,
        idempotencyKey: record.idempotency_key,
        result: 'skipped_already_sent',
      });
      continue;
    }
    if (
      isLeadFollowupFailureAlertCoolingDown({
        minIntervalSeconds: args.deps.minIntervalSeconds,
        nowEpochSeconds,
        record,
      })
    ) {
      result.items.push({
        alertKind,
        idempotencyKey: record.idempotency_key,
        result: 'skipped_cooling_down',
      });
      continue;
    }

    const attemptedAt = args.deps.nowEpochSeconds();
    try {
      const sendResult = await args.deps.sendFailureAlertEmail({ alertKind, record });
      const updated = await args.deps.updateFailureAlertState({
        alertError: null,
        alertKind,
        alertMessageId: sendResult.messageId,
        alertSentAt: attemptedAt,
        alertStatus: 'sent',
        expectedStatus: record.status,
        expectedUpdatedAt: record.updated_at,
        idempotencyKey: record.idempotency_key,
        lastAttemptAt: attemptedAt,
      });
      if (!updated) {
        result.stateChanged += 1;
        result.items.push({
          alertKind,
          idempotencyKey: record.idempotency_key,
          result: 'state_changed',
        });
        continue;
      }
      result.sent += 1;
      result.items.push({
        alertKind,
        idempotencyKey: record.idempotency_key,
        result: 'sent',
      });
    } catch (error: unknown) {
      const { message } = getErrorDetails(error);
      try {
        const updated = await args.deps.updateFailureAlertState({
          alertError: message ?? 'Lead follow-up alert email send failed.',
          alertKind,
          alertMessageId: null,
          alertStatus: 'failed',
          expectedStatus: record.status,
          expectedUpdatedAt: record.updated_at,
          idempotencyKey: record.idempotency_key,
          lastAttemptAt: attemptedAt,
        });
        if (!updated) {
          result.stateChanged += 1;
          result.items.push({
            alertKind,
            error: message ?? null,
            idempotencyKey: record.idempotency_key,
            result: 'state_changed',
          });
          continue;
        }
      } catch (updateError: unknown) {
        console.error('Failed to record lead follow-up alert email failure.', updateError);
      }
      result.sendFailed += 1;
      result.items.push({
        alertKind,
        error: message ?? null,
        idempotencyKey: record.idempotency_key,
        result: 'send_failed',
      });
    }
  }

  return result;
}
