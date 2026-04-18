import { Stack } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { CraigsBackend } from './types';
import { getLambda } from './types';

function grantSesSend(backend: CraigsBackend): void {
  const sendEmailPolicy = new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  });

  getLambda(backend.chatLeadHandoff).addToRolePolicy(sendEmailPolicy);
  getLambda(backend.quoteFollowup).addToRolePolicy(sendEmailPolicy);
}

function configureChatLeadHandoffRetryScheduler(backend: CraigsBackend): void {
  const chatLeadHandoffLambda = getLambda(backend.chatLeadHandoff);
  const retrySchedulerInvokeRole = new Role(
    Stack.of(chatLeadHandoffLambda),
    'ChatLeadHandoffRetrySchedulerInvokeRole',
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

  chatLeadHandoffLambda.addToRolePolicy(
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

  chatLeadHandoffLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [retrySchedulerInvokeRole.roleArn],
    }),
  );

  chatLeadHandoffLambda.addEnvironment(
    'LEAD_RETRY_SCHEDULER_ROLE_ARN',
    retrySchedulerInvokeRole.roleArn,
  );
  chatLeadHandoffLambda.addEnvironment('LEAD_RETRY_SCHEDULE_GROUP', 'default');
}

export function configureLambdaPermissions(backend: CraigsBackend): void {
  grantSesSend(backend);
  configureChatLeadHandoffRetryScheduler(backend);
}
