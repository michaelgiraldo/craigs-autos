import { Duration, Stack } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { CraigsBackend } from './types';
import { getLambda } from './types';

function addLeadCriticalLambdaAlarms(idPrefix: string, lambda: IFunction): void {
  const stack = Stack.of(lambda);

  new Alarm(stack, `${idPrefix}ErrorsAlarm`, {
    alarmDescription: `Lead-critical Lambda ${lambda.functionName} has runtime errors.`,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    evaluationPeriods: 1,
    metric: lambda.metricErrors({
      period: Duration.minutes(5),
      statistic: 'sum',
    }),
    threshold: 1,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });

  new Alarm(stack, `${idPrefix}ThrottlesAlarm`, {
    alarmDescription: `Lead-critical Lambda ${lambda.functionName} is being throttled.`,
    comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    evaluationPeriods: 1,
    metric: lambda.metricThrottles({
      period: Duration.minutes(5),
      statistic: 'sum',
    }),
    threshold: 1,
    treatMissingData: TreatMissingData.NOT_BREACHING,
  });
}

export function configureMonitoring(backend: CraigsBackend): void {
  for (const [idPrefix, lambda] of [
    ['QuoteRequestSubmit', getLambda(backend.quoteRequestSubmit)],
    ['EmailIntakeCapture', getLambda(backend.emailIntakeCapture)],
    ['ChatHandoffPromote', getLambda(backend.chatHandoffPromote)],
    ['LeadFollowupWorker', getLambda(backend.leadFollowupWorker)],
    ['LeadAdminApi', getLambda(backend.leadAdminApi)],
  ] as const) {
    addLeadCriticalLambdaAlarms(idPrefix, lambda);
  }
}
