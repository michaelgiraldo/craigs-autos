import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import { buildRawEmail } from '../../../../_shared/outgoing-email.ts';
import type {
  EmailDeliveryInput,
  EmailMessagingProvider,
  ProviderReadiness,
  ProviderReadinessIssue,
} from '../provider-contracts.ts';

export type SesEmailProviderConfig = {
  ses: SESv2Client | null;
};

function readinessMessage(issues: ProviderReadinessIssue[]): string {
  if (!issues.length) return 'SES email provider is ready.';
  return `SES email provider is not ready: ${issues.map((issue) => issue.message).join('; ')}.`;
}

export function getSesEmailReadiness(config: SesEmailProviderConfig): ProviderReadiness {
  const issues: ProviderReadinessIssue[] = [];

  if (!config.ses) {
    issues.push({ code: 'missing_client', message: 'SES client is missing' });
  }

  return {
    provider: 'ses',
    capability: 'email_delivery',
    enabled: true,
    ready: issues.length === 0,
    issues,
    message: readinessMessage(issues),
  };
}

function cleanAddress(value: string | null | undefined): string | null {
  const cleaned = value?.trim() ?? '';
  return cleaned || null;
}

function cleanAddressList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function hasHeaders(headers: EmailDeliveryInput['headers']): boolean {
  return Object.values(headers ?? {}).some((value) => Boolean(value));
}

function validateEmailDeliveryInput(args: EmailDeliveryInput): {
  bcc: string[];
  from: string;
  replyTo: string | null;
  to: string[];
} {
  const from = cleanAddress(args.from);
  const to = cleanAddressList(args.to);
  const bcc = cleanAddressList(args.bcc);
  const replyTo = cleanAddress(args.replyTo);

  if (!from) {
    throw new Error('SES email delivery requires a sender email address');
  }
  if (!to.length) {
    throw new Error('SES email delivery requires at least one recipient email address');
  }
  if (args.required?.replyTo && !replyTo) {
    throw new Error('SES email delivery requires a reply-to email address');
  }
  if (args.required?.bcc && !bcc.length) {
    throw new Error('SES email delivery requires a BCC email address');
  }

  return { bcc, from, replyTo, to };
}

export function createSesEmailProvider(config: SesEmailProviderConfig): EmailMessagingProvider {
  const readiness = getSesEmailReadiness(config);

  return {
    provider: 'ses',
    capability: 'email_delivery',
    readiness,
    async sendEmail(args) {
      if (!readiness.ready || !config.ses) {
        throw new Error(readiness.message);
      }

      const { bcc, from, replyTo, to } = validateEmailDeliveryInput(args);
      const attachments = args.attachments ?? [];
      const useRawEmail = attachments.length > 0 || hasHeaders(args.headers);

      if (useRawEmail) {
        const result = await config.ses.send(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: {
              ToAddresses: to,
              ...(bcc.length ? { BccAddresses: bcc } : {}),
            },
            Content: {
              Raw: {
                Data: buildRawEmail({
                  attachments,
                  bcc,
                  from,
                  headers: args.headers,
                  html: args.html,
                  replyTo: replyTo ?? undefined,
                  subject: args.subject,
                  text: args.text,
                  to,
                }),
              },
            },
          }),
        );

        return { messageId: result.MessageId ?? '' };
      }

      const result = await config.ses.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: {
            ToAddresses: to,
            ...(bcc.length ? { BccAddresses: bcc } : {}),
          },
          ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
          Content: {
            Simple: {
              Subject: {
                Charset: 'UTF-8',
                Data: args.subject,
              },
              Body: {
                Html: {
                  Charset: 'UTF-8',
                  Data: args.html,
                },
                Text: {
                  Charset: 'UTF-8',
                  Data: args.text,
                },
              },
            },
          },
        }),
      );

      return { messageId: result.MessageId ?? '' };
    },
  };
}
