function compactHeaderValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEmailMessageId(value: string | null | undefined): string {
  const trimmed = compactHeaderValue(value ?? '');
  if (!trimmed) return '';
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed : `<${trimmed}>`;
}

export function normalizeEmailReferences(value: string | null | undefined): string {
  return compactHeaderValue(value ?? '')
    .split(/\s+/)
    .map((item) => normalizeEmailMessageId(item))
    .filter(Boolean)
    .join(' ');
}

export function dedupeEmailReferences(value: string): string {
  const seen = new Set<string>();
  return value
    .split(/\s+/)
    .map((item) => normalizeEmailMessageId(item))
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .join(' ');
}

export function buildReplySubject(
  inboundSubject: string | null | undefined,
  fallbackSubject = "Your message to Craig's Auto Upholstery",
): string {
  const subject = compactHeaderValue(inboundSubject ?? '') || fallbackSubject;
  return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function buildEmailThreadingHeaders(args: {
  sourceMessageId: string | null | undefined;
  sourceReferences?: string | null | undefined;
}): Record<string, string> {
  const sourceMessageId = normalizeEmailMessageId(args.sourceMessageId);
  if (!sourceMessageId) return {};

  const references = dedupeEmailReferences(
    [normalizeEmailReferences(args.sourceReferences), sourceMessageId].filter(Boolean).join(' '),
  );

  return {
    'In-Reply-To': sourceMessageId,
    References: references,
  };
}
