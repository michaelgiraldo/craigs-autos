import type { EmailMessagingProvider } from '../_lead-platform/services/providers/provider-contracts.ts';
import type { OutgoingEmailAttachment } from '../_shared/outgoing-email.ts';
import {
  buildLeadNotificationEmailContent,
  buildLeadNotificationResultLabel,
} from './lead-notification-template.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createLeadNotificationEmailSender(args: {
  emailProvider: EmailMessagingProvider;
  fromEmail: string;
  loadAttachments?: (
    record: Parameters<LeadFollowupWorkerDeps['sendLeadNotificationEmail']>[0]['record'],
  ) => Promise<OutgoingEmailAttachment[]>;
  smsProviderReady: boolean;
  toEmail: string;
}): LeadFollowupWorkerDeps['sendLeadNotificationEmail'] {
  return async ({ record }) => {
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

    const result = await args.emailProvider.sendEmail({
      attachments,
      from: args.fromEmail,
      headers: attachments.length ? { 'X-Craigs-Email-Intake': 'lead-notification-v1' } : {},
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: [args.toEmail],
    });

    return { messageId: result.messageId };
  };
}
