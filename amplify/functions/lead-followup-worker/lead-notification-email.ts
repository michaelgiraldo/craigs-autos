import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { buildRawEmail, type OutgoingEmailAttachment } from '../_shared/outgoing-email.ts';
import {
  buildLeadNotificationEmailContent,
  buildLeadNotificationResultLabel,
} from './lead-notification-template.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createSesLeadNotificationEmailSender(args: {
  fromEmail: string;
  loadAttachments?: (
    record: Parameters<LeadFollowupWorkerDeps['sendLeadNotificationEmail']>[0]['record'],
  ) => Promise<OutgoingEmailAttachment[]>;
  smsProviderReady: boolean;
  ses: SESv2Client | null;
  toEmail: string;
}): LeadFollowupWorkerDeps['sendLeadNotificationEmail'] {
  return async ({ record }) => {
    if (!args.ses || !args.fromEmail || !args.toEmail) {
      throw new Error('SES is not configured');
    }

    const attachments = args.loadAttachments ? await args.loadAttachments(record) : [];
    const resultLabel = buildLeadNotificationResultLabel(
      record.outreach_result,
      args.smsProviderReady,
    );
    const message = buildLeadNotificationEmailContent({
      attachedPhotoCount: attachments.length,
      record,
      resultLabel,
    });

    if (attachments.length) {
      const result = await args.ses.send(
        new SendEmailCommand({
          FromEmailAddress: args.fromEmail,
          Destination: {
            ToAddresses: [args.toEmail],
          },
          Content: {
            Raw: {
              Data: buildRawEmail({
                from: args.fromEmail,
                to: [args.toEmail],
                subject: message.subject,
                text: message.text,
                html: message.html,
                attachments,
                headers: {
                  'X-Craigs-Email-Intake': 'lead-notification-v1',
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
          ToAddresses: [args.toEmail],
        },
        Content: {
          Simple: {
            Subject: {
              Charset: 'UTF-8',
              Data: message.subject,
            },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: message.html,
              },
              Text: {
                Charset: 'UTF-8',
                Data: message.text,
              },
            },
          },
        },
      }),
    );

    return { messageId: result.MessageId ?? '' };
  };
}
