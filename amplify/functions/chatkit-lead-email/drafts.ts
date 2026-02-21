type LeadSummaryDraftFields = {
  customer_name: string | null;
  vehicle: string | null;
  project: string | null;
  outreach_message: string | null;
};

type BuildLeadSubjectArgs = {
  leadSummary: Pick<LeadSummaryDraftFields, 'vehicle' | 'project'> | null;
  threadTitle: string | null;
};

type BuildOutreachDraftsArgs = {
  leadSummary: LeadSummaryDraftFields | null;
  shopName: string;
  shopPhoneDisplay: string;
  shopPhoneDigits: string;
  shopAddress: string;
};

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function hasShopPhone(value: string, shopPhoneDigits: string): boolean {
  return digitsOnly(value).includes(shopPhoneDigits);
}

function hasShopName(value: string): boolean {
  return /craig'?s\s+auto\s+upholstery/i.test(value);
}

function hasShopAddress(value: string): boolean {
  return /271\s+bestor/i.test(value) || /\bbestor\b/i.test(value);
}

function ensureShopSignature(
  value: string,
  args: Pick<BuildOutreachDraftsArgs, 'shopName' | 'shopPhoneDisplay' | 'shopPhoneDigits'>,
): string {
  let out = value.trim();
  if (!hasShopName(out)) {
    out = `${out}\n\n- ${args.shopName}`;
  }
  if (!hasShopPhone(out, args.shopPhoneDigits)) {
    out = `${out}\n${args.shopPhoneDisplay}`;
  }
  return normalizeWhitespace(out);
}

function pickTrimmedOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  return parts
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(separator);
}

export function buildLeadEmailSubject(args: BuildLeadSubjectArgs): string {
  const subjectContext = joinNonEmpty(
    [args.leadSummary?.vehicle, args.leadSummary?.project],
    ' - ',
  );
  if (subjectContext) return `New chat lead: ${subjectContext}`;
  if (args.threadTitle && args.threadTitle.trim())
    return `New chat lead: ${args.threadTitle.trim()}`;
  return 'New chat lead';
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
    `Hi ${greetingName} - thanks for reaching out to ${args.shopName}${contextSnippet}. If you can text 2-4 photos (1 wide + 1-2 close-ups), we can take a proper look and follow up with next steps. ${args.shopPhoneDisplay}`,
  );
  const recommendedOutreach = ensureShopSignature(outreachMessage ?? fallbackOutreach, args);

  const emailDraftSubject = vehicleOrProject
    ? `${args.shopName} - next steps for ${vehicleOrProject}`
    : `${args.shopName} - next steps`;

  let emailDraftBody = recommendedOutreach;
  if (!hasShopAddress(emailDraftBody)) {
    emailDraftBody = `${emailDraftBody}\n${args.shopAddress}`;
  }
  emailDraftBody = normalizeWhitespace(emailDraftBody);

  return {
    smsDraft: recommendedOutreach,
    emailDraftSubject,
    emailDraftBody,
  };
}
