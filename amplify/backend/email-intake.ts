import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { HostedZone, MxRecord } from 'aws-cdk-lib/aws-route53';
import { BlockPublicAccess, Bucket, BucketEncryption, EventType } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { ReceiptRuleSet, TlsPolicy } from 'aws-cdk-lib/aws-ses';
import { S3 as SesS3Action } from 'aws-cdk-lib/aws-ses-actions';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';
import type { CraigsBackend } from './types';
import { getLambda } from './types';

const RAW_EMAIL_PREFIX = 'raw/';
const EMAIL_INTAKE_SUBDOMAIN = 'email-intake';
const EMAIL_INTAKE_ZONE_NAME = 'craigs.autos';
const EMAIL_INTAKE_HOSTED_ZONE_ID = 'Z0662995DUHWM14WMAA8';

export function configureEmailIntake(backend: CraigsBackend): void {
  const stack = backend.createStack('email-intake');
  const emailIntakeLambda = getLambda(backend.emailIntakeCapture);
  const leadFollowupWorkerLambda = getLambda(backend.leadFollowupWorker);

  const ledgerTable = new Table(stack, 'EmailIntakeLedger', {
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: 'email_intake_key', type: AttributeType.STRING },
    timeToLiveAttribute: 'ttl',
    removalPolicy: RemovalPolicy.DESTROY,
  });
  ledgerTable.grantReadWriteData(emailIntakeLambda);
  emailIntakeLambda.addEnvironment('EMAIL_INTAKE_LEDGER_TABLE_NAME', ledgerTable.tableName);

  const rawEmailBucket = new Bucket(stack, 'EmailIntakeRawEmail', {
    autoDeleteObjects: true,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    encryption: BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadAfter: Duration.days(1),
        expiration: Duration.days(1),
        prefix: RAW_EMAIL_PREFIX,
      },
    ],
    removalPolicy: RemovalPolicy.DESTROY,
  });
  rawEmailBucket.grantRead(emailIntakeLambda);
  rawEmailBucket.grantDelete(emailIntakeLambda);
  rawEmailBucket.grantRead(leadFollowupWorkerLambda);
  rawEmailBucket.grantDelete(leadFollowupWorkerLambda);
  rawEmailBucket.addEventNotification(
    EventType.OBJECT_CREATED,
    new LambdaDestination(emailIntakeLambda),
    { prefix: RAW_EMAIL_PREFIX },
  );

  const ruleSet = new ReceiptRuleSet(stack, 'EmailIntakeReceiptRuleSet', {
    receiptRuleSetName: 'craigs-autos-email-intake',
  });
  const receiptRule = ruleSet.addRule('ContactIntakeRule', {
    actions: [
      new SesS3Action({
        bucket: rawEmailBucket,
        objectKeyPrefix: RAW_EMAIL_PREFIX,
      }),
    ],
    enabled: true,
    receiptRuleName: 'contact-intake-to-s3',
    recipients: [CRAIGS_LEAD_ENV_DEFAULTS.EMAIL_INTAKE_RECIPIENT],
    scanEnabled: true,
    tlsPolicy: TlsPolicy.OPTIONAL,
  });

  const activateRuleSet = new AwsCustomResource(stack, 'ActivateEmailIntakeReceiptRuleSet', {
    onCreate: {
      service: 'SES',
      action: 'setActiveReceiptRuleSet',
      parameters: {
        RuleSetName: ruleSet.receiptRuleSetName,
      },
      physicalResourceId: PhysicalResourceId.of('craigs-autos-email-intake-active-ruleset'),
    },
    onUpdate: {
      service: 'SES',
      action: 'setActiveReceiptRuleSet',
      parameters: {
        RuleSetName: ruleSet.receiptRuleSetName,
      },
      physicalResourceId: PhysicalResourceId.of('craigs-autos-email-intake-active-ruleset'),
    },
    policy: AwsCustomResourcePolicy.fromSdkCalls({
      resources: AwsCustomResourcePolicy.ANY_RESOURCE,
    }),
  });
  activateRuleSet.node.addDependency(ruleSet);
  activateRuleSet.node.addDependency(receiptRule);
  activateRuleSet.node.addDependency(rawEmailBucket);

  const zone = HostedZone.fromHostedZoneAttributes(stack, 'CraigsAutosHostedZone', {
    hostedZoneId: EMAIL_INTAKE_HOSTED_ZONE_ID,
    zoneName: EMAIL_INTAKE_ZONE_NAME,
  });
  new MxRecord(stack, 'EmailIntakeMxRecord', {
    recordName: EMAIL_INTAKE_SUBDOMAIN,
    values: [
      {
        hostName: `inbound-smtp.${stack.region}.amazonaws.com`,
        priority: 10,
      },
    ],
    zone,
  });

  emailIntakeLambda.addToRolePolicy(
    new PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [leadFollowupWorkerLambda.functionArn],
    }),
  );
}
