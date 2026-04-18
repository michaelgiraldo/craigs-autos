import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { buildOwnerEmailContent, buildResultLabel } from './email-content.ts';
import type { QuoteFollowupDeps } from './types.ts';

export function createSesOwnerEmailSender(args: {
  fromEmail: string;
  quoEnabled: boolean;
  ses: SESv2Client | null;
  toEmail: string;
}): QuoteFollowupDeps['sendOwnerEmail'] {
  return async ({ record }) => {
    if (!args.ses || !args.fromEmail || !args.toEmail) {
      throw new Error('SES is not configured');
    }

    const resultLabel = buildResultLabel(record.outreach_result, args.quoEnabled);
    const message = buildOwnerEmailContent({ record, resultLabel });
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
