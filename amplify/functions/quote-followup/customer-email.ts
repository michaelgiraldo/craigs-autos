import type { SESv2Client } from '@aws-sdk/client-sesv2';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { buildCustomerEmailHtml } from './email-content.ts';
import type { QuoteFollowupDeps } from './types.ts';

export function createSesCustomerEmailSender(args: {
  bccEmail: string;
  fromEmail: string;
  replyToEmail: string;
  ses: SESv2Client | null;
}): QuoteFollowupDeps['sendCustomerEmail'] {
  return async ({ to, subject, body }) => {
    if (!args.ses || !args.fromEmail || !args.bccEmail || !args.replyToEmail) {
      throw new Error('SES is not configured');
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
