import type { EmailMessagingProvider } from '../_lead-platform/services/providers/provider-contracts.ts';
import { buildEmailThreadingHeaders } from '../_shared/email-threading.ts';
import { buildCustomerFollowupEmailHtml } from './customer-followup-template.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createCustomerEmailSender(args: {
  bccEmail: string;
  emailProvider: EmailMessagingProvider;
  emailIntakeFromEmail: string;
  emailIntakeReplyToEmail: string;
  fromEmail: string;
  replyToEmail: string;
}): LeadFollowupWorkerDeps['sendCustomerEmail'] {
  return async ({ record, to, subject, body }) => {
    if (record.source_message_id) {
      const fromEmail = args.emailIntakeFromEmail || args.fromEmail;
      const replyToEmail = args.emailIntakeReplyToEmail || args.replyToEmail;
      const result = await args.emailProvider.sendEmail({
        bcc: [args.bccEmail],
        from: fromEmail,
        headers: {
          ...buildEmailThreadingHeaders({
            sourceMessageId: record.source_message_id,
            sourceReferences: record.source_references,
          }),
          'X-Craigs-Email-Intake': 'initial-response-v1',
        },
        html: buildCustomerFollowupEmailHtml(body),
        replyTo: replyToEmail,
        required: { bcc: true, replyTo: true },
        subject,
        text: body,
        to: [to],
      });

      return { messageId: result.messageId };
    }

    const result = await args.emailProvider.sendEmail({
      bcc: [args.bccEmail],
      from: args.fromEmail,
      html: buildCustomerFollowupEmailHtml(body),
      replyTo: args.replyToEmail,
      required: { bcc: true, replyTo: true },
      subject,
      text: body,
      to: [to],
    });

    return { messageId: result.messageId };
  };
}
