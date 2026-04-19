import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';
import { getErrorDetails } from '../_shared/safe.ts';
import type { ChatHandoffPromoteRequest } from './lead-types.ts';
import { leadRetryScheduleGroupName, leadRetrySchedulerRoleArn, scheduler } from './runtime.ts';

function buildRetryScheduleName(threadId: string): string {
  const safeId = threadId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `lead-retry-${safeId}`.slice(0, 64);
}

function atExpressionUtc(epochSeconds: number): string {
  const utc = new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, '');
  return `at(${utc})`;
}

export async function upsertLeadRetrySchedule(args: {
  threadId: string;
  runAtEpochSeconds: number;
  functionArn: string;
  payload: ChatHandoffPromoteRequest;
}): Promise<boolean> {
  if (!scheduler || !args.functionArn || !leadRetrySchedulerRoleArn) return false;

  const scheduleName = buildRetryScheduleName(args.threadId);
  const scheduleExpression = atExpressionUtc(args.runAtEpochSeconds);
  const input = JSON.stringify({
    ...args.payload,
    reason: 'server_retry',
  });

  const scheduleRequest = {
    Name: scheduleName,
    GroupName: leadRetryScheduleGroupName,
    FlexibleTimeWindow: { Mode: 'OFF' as const },
    ScheduleExpression: scheduleExpression,
    ScheduleExpressionTimezone: 'UTC',
    ActionAfterCompletion: 'DELETE' as const,
    Target: {
      Arn: args.functionArn,
      RoleArn: leadRetrySchedulerRoleArn,
      Input: input,
      RetryPolicy: {
        MaximumEventAgeInSeconds: 3600,
        MaximumRetryAttempts: 1,
      },
    },
  };

  try {
    await scheduler.send(new CreateScheduleCommand(scheduleRequest));
    return true;
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    if (name !== 'ConflictException') {
      console.error('Lead retry schedule create failed', name, message);
      return false;
    }
  }

  try {
    await scheduler.send(
      new UpdateScheduleCommand({
        ...scheduleRequest,
        State: 'ENABLED',
      }),
    );
    return true;
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    console.error('Lead retry schedule update failed', name, message);
    return false;
  }
}

export async function deleteLeadRetrySchedule(threadId: string): Promise<void> {
  if (!scheduler) return;
  const scheduleName = buildRetryScheduleName(threadId);
  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: leadRetryScheduleGroupName,
      }),
    );
  } catch (err: unknown) {
    const { name, message } = getErrorDetails(err);
    if (name === 'ResourceNotFoundException') return;
    console.error('Lead retry schedule delete failed', name, message);
  }
}
