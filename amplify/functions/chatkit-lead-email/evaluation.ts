import { generateLeadSummary } from './lead-summary';
import type { LeadAttachment, LeadSummary, TranscriptLine } from './lead-types';
import { phoneToE164, extractCustomerContact } from './text-utils';
import { buildTranscript } from './transcript';
import { latestActivityEpochSeconds } from './runtime.ts';

type ContactDetection = {
  email: string | null;
  phone: string | null;
};

export type ChatLeadEvaluationBlocked = {
  outcome: 'blocked';
  reason: string;
  attachments: LeadAttachment[];
  threadTitle: string | null;
  threadUser: string | null;
  lines: TranscriptLine[];
};

export type ChatLeadEvaluationDeferred = {
  outcome: 'deferred';
  attachments: LeadAttachment[];
  reason: 'not_idle';
  threadTitle: string | null;
  threadUser: string | null;
  lines: TranscriptLine[];
  lastMessageAt: number;
  secondsSinceLastActivity: number;
};

export type ChatLeadEvaluationReady = {
  outcome: 'ready';
  attachments: LeadAttachment[];
  threadTitle: string | null;
  threadUser: string | null;
  lines: TranscriptLine[];
  leadSummary: LeadSummary;
  customerPhone: string | null;
  customerEmail: string | null;
  customerPhoneE164: string | null;
};

export type ChatLeadEvaluation =
  | ChatLeadEvaluationBlocked
  | ChatLeadEvaluationDeferred
  | ChatLeadEvaluationReady;

type EvaluateChatLeadArgs = {
  openai: unknown;
  threadId: string;
  assistantName: string;
  locale: string;
  pageUrl: string;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  leadSummaryModel: string;
  idleDelaySeconds: number;
  currentEpochSeconds: number;
};

function hydrateLeadSummary(leadSummary: LeadSummary | null, detectedContact: ContactDetection): LeadSummary | null {
  if (!leadSummary) return null;
  if (leadSummary.customer_email && leadSummary.customer_phone) return leadSummary;
  return {
    ...leadSummary,
    customer_email: leadSummary.customer_email ?? detectedContact.email,
    customer_phone: leadSummary.customer_phone ?? detectedContact.phone,
  };
}

export async function evaluateChatLead(args: EvaluateChatLeadArgs): Promise<ChatLeadEvaluation> {
  const { threadTitle, threadUser, attachments, lines } = await buildTranscript({
    openai: args.openai as never,
    threadId: args.threadId,
    assistantName: args.assistantName,
  });

  const hasCustomerMessage = lines.some((line) => line.speaker === 'Customer');
  if (!hasCustomerMessage) {
    return {
      attachments,
      outcome: 'blocked',
      reason: 'empty_thread',
      threadTitle,
      threadUser,
      lines,
    };
  }

  const detectedContact = extractCustomerContact(lines, args.shopPhoneDigits);
  if (!detectedContact.email && !detectedContact.phone) {
    return {
      attachments,
      outcome: 'blocked',
      reason: 'missing_contact',
      threadTitle,
      threadUser,
      lines,
    };
  }

  const lastMessageAt = latestActivityEpochSeconds(lines);
  if (
    lastMessageAt !== null &&
    args.currentEpochSeconds - lastMessageAt < args.idleDelaySeconds
  ) {
    return {
      attachments,
      outcome: 'deferred',
      reason: 'not_idle',
      threadTitle,
      threadUser,
      lines,
      lastMessageAt,
      secondsSinceLastActivity: args.currentEpochSeconds - lastMessageAt,
    };
  }

  const leadSummary = await generateLeadSummary({
    openai: args.openai as never,
    leadSummaryModel: args.leadSummaryModel,
    locale: args.locale,
    pageUrl: args.pageUrl,
    transcript: lines,
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
  });

  if (leadSummary?.handoff_ready !== true) {
    return {
      attachments,
      outcome: 'blocked',
      reason: leadSummary?.handoff_reason || 'not_ready',
      threadTitle,
      threadUser,
      lines,
    };
  }

  const hydratedLeadSummary = hydrateLeadSummary(leadSummary, detectedContact);
  const customerPhone = hydratedLeadSummary?.customer_phone ?? detectedContact.phone ?? null;
  const customerEmail = hydratedLeadSummary?.customer_email ?? detectedContact.email ?? null;
  const customerPhoneE164 = customerPhone ? phoneToE164(customerPhone) : null;

  return {
    attachments,
    outcome: 'ready',
    threadTitle,
    threadUser,
    lines,
    leadSummary: hydratedLeadSummary ?? leadSummary,
    customerPhone,
    customerEmail,
    customerPhoneE164,
  };
}
