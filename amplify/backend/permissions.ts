import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { CraigsBackend } from './types';
import { getLambda } from './types';

function grantSesSend(backend: CraigsBackend): void {
  const sendEmailPolicy = new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  });

  getLambda(backend.chatHandoffPromote).addToRolePolicy(sendEmailPolicy);
  getLambda(backend.leadFollowupWorker).addToRolePolicy(sendEmailPolicy);
}

function configureChatHandoffPromoteRetryScheduler(backend: CraigsBackend): void {
  const chatHandoffPromoteLambda = getLambda(backend.chatHandoffPromote);
  const retrySchedulerInvokeRole = new Role(
    Stack.of(chatHandoffPromoteLambda),
    'ChatHandoffPromoteRetrySchedulerInvokeRole',
    {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    },
  );

  retrySchedulerInvokeRole.addToPolicy(
    new PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: ['*'],
    }),
  );

  chatHandoffPromoteLambda.addToRolePolicy(
    new PolicyStatement({
      actions: [
        'scheduler:CreateSchedule',
        'scheduler:UpdateSchedule',
        'scheduler:DeleteSchedule',
        'scheduler:GetSchedule',
      ],
      resources: ['*'],
    }),
  );

  chatHandoffPromoteLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [retrySchedulerInvokeRole.roleArn],
    }),
  );

  chatHandoffPromoteLambda.addEnvironment(
    'LEAD_RETRY_SCHEDULER_ROLE_ARN',
    retrySchedulerInvokeRole.roleArn,
  );
  chatHandoffPromoteLambda.addEnvironment('LEAD_RETRY_SCHEDULE_GROUP', 'default');
}

export function configureLambdaPermissions(backend: CraigsBackend): void {
  grantSesSend(backend);
  configureChatHandoffPromoteRetryScheduler(backend);
}
