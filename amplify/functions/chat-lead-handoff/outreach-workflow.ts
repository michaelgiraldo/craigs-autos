import { getErrorDetails } from '../_shared/safe.ts';
import { buildOutreachDrafts } from './drafts';
import { type InitialOutreachState, sendTranscriptEmail } from './email-delivery';
import type {
  LeadAttachment,
  LeadAttributionPayload,
  LeadDedupeRecord,
  LeadSummary,
  TranscriptLine,
} from './lead-types';
import {
  markLeadEmailSent,
  markLeadHandoffCompleted,
  markLeadQuoError,
  markLeadQuoSent,
} from './dedupe-store.ts';
import { sendQuoTextMessage } from './quo.ts';

export type ChatOutreachResult = {
  automatedTextSent: boolean;
  initialOutreach: InitialOutreachState;
};

type RunChatOutreachArgs = {
  progress: LeadDedupeRecord | null;
  leaseId: string;
  threadId: string;
  reason: string;
  locale: string;
  pageUrl: string;
  chatUser: string;
  threadTitle: string | null;
  attachments: LeadAttachment[];
  transcript: TranscriptLine[];
  leadSummary: LeadSummary;
  attribution: LeadAttributionPayload;
  customerPhone: string | null;
  customerPhoneE164: string | null;
  quoEnabled: boolean;
  quoApiKey: string | null;
  quoFromPhoneNumberId: string | null;
  quoUserId: string | null;
  leadToEmail: string;
  leadFromEmail: string;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  shopAddress: string;
  leadEmailRawMessageMaxBytes: number;
  nowEpochSeconds: () => number;
  createMessageLinkUrl: Parameters<typeof sendTranscriptEmail>[0]['createMessageLinkUrl'];
  ses: Parameters<typeof sendTranscriptEmail>[0]['ses'];
};

export async function runChatOutreach(args: RunChatOutreachArgs): Promise<ChatOutreachResult> {
  const { smsDraft } = buildOutreachDrafts({
    leadSummary: args.leadSummary,
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
    shopPhoneDigits: args.shopPhoneDigits,
    shopAddress: args.shopAddress,
  });

  let automatedTextSent = false;
  let initialOutreach: InitialOutreachState = {
    provider: 'quo',
    channel: 'sms',
    status: 'not_attempted',
    body: smsDraft,
    ...(args.customerPhone ? {} : { error: 'No customer phone number was captured.' }),
  };

  if (args.progress?.quo_sent_at) {
    automatedTextSent = true;
    initialOutreach = {
      provider: 'quo',
      channel: 'sms',
      status: 'sent',
      body: smsDraft,
      sentAt: args.progress?.quo_sent_at,
      messageId: args.progress?.quo_message_id ?? null,
    };
  } else if (!args.customerPhone) {
    initialOutreach = {
      provider: 'quo',
      channel: 'sms',
      status: 'not_attempted',
      body: smsDraft,
      error: 'No customer phone number was captured.',
    };
  } else if (!args.customerPhoneE164) {
    const message = 'Customer phone number could not be normalized for QUO.';
    console.error('Skipping QUO automated text:', message);
    initialOutreach = {
      provider: 'quo',
      channel: 'sms',
      status: 'failed',
      body: smsDraft,
      error: message,
    };
  } else if (!args.quoEnabled) {
    initialOutreach = {
      provider: 'quo',
      channel: 'sms',
      status: 'failed',
      body: smsDraft,
      error: 'QUO automation is disabled.',
    };
  } else if (!args.quoApiKey || !args.quoFromPhoneNumberId) {
    const message = 'QUO configuration is incomplete.';
    console.error('Skipping QUO automated text:', message);
    initialOutreach = {
      provider: 'quo',
      channel: 'sms',
      status: 'failed',
      body: smsDraft,
      error: message,
    };
  } else {
    try {
      const quoMessage = await sendQuoTextMessage({
        apiKey: args.quoApiKey,
        fromPhoneNumberId: args.quoFromPhoneNumberId,
        toE164: args.customerPhoneE164,
        content: smsDraft,
        userId: args.quoUserId || undefined,
      });
      try {
        await markLeadQuoSent({
          threadId: args.threadId,
          leaseId: args.leaseId,
          messageId: quoMessage.id,
        });
      } catch (err: unknown) {
        const { name, message } = getErrorDetails(err);
        console.error('Lead dedupe mark QUO sent failed', name, message);
      }
      automatedTextSent = true;
      initialOutreach = {
        provider: 'quo',
        channel: 'sms',
        status: 'sent',
        body: smsDraft,
        sentAt: args.nowEpochSeconds(),
        messageId: quoMessage.id,
      };
    } catch (err: unknown) {
      const { name, message } = getErrorDetails(err);
      console.error('QUO automated text failed', name, message);
      try {
        await markLeadQuoError({
          threadId: args.threadId,
          leaseId: args.leaseId,
          errorMessage: message ?? 'QUO automated text failed',
        });
      } catch (markErr: unknown) {
        const { name: markName, message: markMessage } = getErrorDetails(markErr);
        console.error('Lead dedupe mark QUO error failed', markName, markMessage);
      }
      initialOutreach = {
        provider: 'quo',
        channel: 'sms',
        status: 'failed',
        body: smsDraft,
        error: message ?? 'QUO automated text failed',
      };
    }
  }

  if (!args.progress?.email_sent_at) {
    const messageId = await sendTranscriptEmail({
      ses: args.ses,
      leadToEmail: args.leadToEmail,
      leadFromEmail: args.leadFromEmail,
      threadId: args.threadId,
      locale: args.locale,
      pageUrl: args.pageUrl,
      chatUser: args.chatUser,
      reason: args.reason,
      threadTitle: args.threadTitle,
      attachments: args.attachments,
      transcript: args.transcript,
      leadSummary: args.leadSummary,
      attribution: args.attribution,
      shopName: args.shopName,
      shopPhoneDisplay: args.shopPhoneDisplay,
      shopPhoneDigits: args.shopPhoneDigits,
      shopAddress: args.shopAddress,
      leadEmailRawMessageMaxBytes: args.leadEmailRawMessageMaxBytes,
      initialOutreach,
      createMessageLinkUrl: args.createMessageLinkUrl,
    });
    try {
      await markLeadEmailSent({ threadId: args.threadId, leaseId: args.leaseId, messageId });
    } catch (err: unknown) {
      const { name, message } = getErrorDetails(err);
      console.error('Lead dedupe mark email sent failed', name, message);
    }
  }

  await markLeadHandoffCompleted({ threadId: args.threadId, leaseId: args.leaseId });

  return {
    automatedTextSent,
    initialOutreach,
  };
}
