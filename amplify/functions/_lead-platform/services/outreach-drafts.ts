import { buildEmailSignature, buildSmsSignature } from '@craigs/business-profile/business-profile';
import { normalizeWhitespace } from '../../_shared/text-utils.ts';

export type LeadSummaryDraftFields = {
  customer_name: string | null;
  vehicle: string | null;
  service: string | null;
  project_summary: string | null;
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

export function stripCanonicalBusinessSignature(body: string, signatures: string[] = []): string {
  let output = normalizeWhitespace(body);
  const normalizedSignatures = signatures
    .map((signature) => normalizeWhitespace(signature))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const signature of normalizedSignatures) {
    if (output === signature) return '';
    if (output.endsWith(`\n\n${signature}`)) {
      output = output.slice(0, -signature.length).trim();
      continue;
    }
    if (output.endsWith(`\n${signature}`)) {
      output = output.slice(0, -signature.length).trim();
    }
  }

  return normalizeWhitespace(output);
}

export function appendCanonicalBusinessSignature(args: {
  body: string;
  signature: string;
  stripSignatures?: string[];
}): string {
  const signature = normalizeWhitespace(args.signature);
  const body = stripCanonicalBusinessSignature(args.body, args.stripSignatures ?? [signature]);
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
    [args.leadSummary?.vehicle, args.leadSummary?.service ?? args.leadSummary?.project_summary],
    ' - ',
  );
  const contextSnippet = vehicleOrProject ? ` about your ${vehicleOrProject}` : '';

  const fallbackOutreach = normalizeWhitespace(
    `Hi ${greetingName} - thanks for reaching out${contextSnippet}. If you can text 2-4 photos (1 wide + 1-2 close-ups), we can take a proper look and follow up with next steps.`,
  );
  const body = normalizeWhitespace(fallbackOutreach);
  const smsSignature = buildSmsSignature({
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
  });
  const emailSignature = buildEmailSignature({
    shopName: args.shopName,
    shopPhoneDisplay: args.shopPhoneDisplay,
    shopAddress: args.shopAddress,
  });
  const canonicalSignatures = [emailSignature, smsSignature];

  const emailDraftSubject = vehicleOrProject
    ? `${args.shopName} - next steps for ${vehicleOrProject}`
    : `${args.shopName} - next steps`;

  return {
    smsDraft: appendCanonicalBusinessSignature({
      body,
      signature: smsSignature,
      stripSignatures: canonicalSignatures,
    }),
    emailDraftSubject,
    emailDraftBody: appendCanonicalBusinessSignature({
      body,
      signature: emailSignature,
      stripSignatures: canonicalSignatures,
    }),
  };
}
