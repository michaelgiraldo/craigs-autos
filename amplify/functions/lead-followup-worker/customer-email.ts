import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { buildRawEmail } from '../_shared/outgoing-email.ts';
import { buildCustomerEmailHtml } from './email-content.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

function normalizeReferences(value: string): string {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith('<') && item.endsWith('>'))
    .join(' ');
}

function dedupeReferences(value: string): string {
  const seen = new Set<string>();
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .join(' ');
}

export function createSesCustomerEmailSender(args: {
  bccEmail: string;
  emailIntakeFromEmail: string;
  emailIntakeReplyToEmail: string;
  fromEmail: string;
  replyToEmail: string;
  ses: SESv2Client | null;
}): LeadFollowupWorkerDeps['sendCustomerEmail'] {
  return async ({ record, to, subject, body }) => {
    if (!args.ses || !args.fromEmail || !args.bccEmail || !args.replyToEmail) {
      throw new Error('SES is not configured');
    }

    if (record.source_message_id) {
      const fromEmail = args.emailIntakeFromEmail || args.fromEmail;
      const replyToEmail = args.emailIntakeReplyToEmail || args.replyToEmail;
      const references = dedupeReferences(
        [normalizeReferences(record.source_references ?? ''), record.source_message_id]
          .filter(Boolean)
          .join(' '),
      );
      const result = await args.ses.send(
        new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: {
            ToAddresses: [to],
            BccAddresses: [args.bccEmail],
          },
          Content: {
            Raw: {
              Data: buildRawEmail({
                from: fromEmail,
                to: [to],
                replyTo: replyToEmail,
                subject,
                text: body,
                html: buildCustomerEmailHtml(body),
                headers: {
                  'In-Reply-To': record.source_message_id,
                  References: references,
                  'X-Craigs-Email-Intake': 'initial-response-v1',
                },
              }),
            },
          },
        }),
      );

      return { messageId: result.MessageId ?? '' };
    }

    const result = await args.ses.send(
      new SendEmailCommand({
        FromEmailAddress: args.fromEmail,
        Destination: {
          ToAddresses: [to],
          BccAddresses: [args.bccEmail],
        },
        ReplyToAddresses: [args.replyToEmail],
        Content: {
          Simple: {
            Subject: {
              Charset: 'UTF-8',
              Data: subject,
            },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: buildCustomerEmailHtml(body),
              },
              Text: {
                Charset: 'UTF-8',
                Data: body,
              },
            },
          },
        },
      }),
    );

    return { messageId: result.MessageId ?? '' };
  };
}
