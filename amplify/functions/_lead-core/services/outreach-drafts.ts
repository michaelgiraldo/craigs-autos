import { buildEmailSignature, buildSmsSignature } from '../../../../shared/business-profile.js';
import { normalizeWhitespace } from '../../_shared/text-utils.ts';

export type LeadSummaryDraftFields = {
  customer_name: string | null;
  vehicle: string | null;
  project: string | null;
  outreach_message: string | null;
};

type BuildOutreachDraftsArgs = {
  leadSummary: LeadSummaryDraftFields | null;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  shopAddress: string;
};

function pickTrimmedOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(separator);
}

function appendSignature(body: string, signature: string): string {
  return normalizeWhitespace([body, signature].filter(Boolean).join('\n\n'));
}

export function buildOutreachDrafts(args: BuildOutreachDraftsArgs): {
  smsDraft: string;
  emailDraftSubject: string;
  emailDraftBody: string;
} {
  const contactName = pickTrimmedOrNull(args.leadSummary?.customer_name);
  const greetingName = contactName ?? 'there';
  const vehicleOrProject = joinNonEmpty(
    [args.leadSummary?.vehicle, args.leadSummary?.project],
    ' - ',
  );
  const contextSnippet = vehicleOrProject ? ` about your ${vehicleOrProject}` : '';

  const outreachMessage = pickTrimmedOrNull(args.leadSummary?.outreach_message);
  const fallbackOutreach = normalizeWhitespace(
    `Hi ${greetingName} - thanks for reaching out${contextSnippet}. If you can text 2-4 photos (1 wide + 1-2 close-ups), we can take a proper look and follow up with next steps.`,
  );
  const body = normalizeWhitespace(outreachMessage ?? fallbackOutreach);

  const emailDraftSubject = vehicleOrProject
    ? `${args.shopName} - next steps for ${vehicleOrProject}`
    : `${args.shopName} - next steps`;

  return {
    smsDraft: appendSignature(
      body,
      buildSmsSignature({
        shopName: args.shopName,
        shopPhoneDisplay: args.shopPhoneDisplay,
      }),
    ),
    emailDraftSubject,
    emailDraftBody: appendSignature(
      body,
      buildEmailSignature({
        shopName: args.shopName,
        shopPhoneDisplay: args.shopPhoneDisplay,
        shopAddress: args.shopAddress,
      }),
    ),
  };
}
