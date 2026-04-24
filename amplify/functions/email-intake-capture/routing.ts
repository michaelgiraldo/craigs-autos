import type { EmailIntakeDeps, ParsedInboundEmail } from './types.ts';

function addressMatches(value: string, expected: string): boolean {
  return value.trim().toLowerCase() === expected.trim().toLowerCase();
}

function normalizeRouteHeader(value: string): string {
  return value.trim().toLowerCase();
}

function listIdForGroupAddress(address: string): string {
  const [localPart, domain] = address.trim().toLowerCase().split('@');
  if (!localPart || !domain) return '';
  return `<${localPart}.${domain}>`;
}

function isTrustedContactGroupRoute(email: ParsedInboundEmail, originalRecipient: string): boolean {
  const expectedRecipient = originalRecipient.trim().toLowerCase();
  if (!expectedRecipient) return false;

  const hasVisibleContactRecipient = email.to.some((recipient) =>
    addressMatches(recipient.address, expectedRecipient),
  );
  if (!hasVisibleContactRecipient) return false;

  const listId = normalizeRouteHeader(email.header('list-id'));
  const mailingList = normalizeRouteHeader(email.header('mailing-list'));
  const sender = normalizeRouteHeader(email.header('sender'));
  const returnPath = normalizeRouteHeader(email.header('return-path'));
  const expectedListId = listIdForGroupAddress(expectedRecipient);

  const hasContactGroupListHeader =
    (expectedListId && listId === expectedListId) ||
    mailingList.startsWith(`list ${expectedRecipient}`) ||
    mailingList.includes(`; ${expectedRecipient} `);
  const hasContactGroupSender =
    addressMatches(sender, expectedRecipient) ||
    (returnPath.startsWith(`<${expectedRecipient.split('@')[0]}+`) &&
      returnPath.endsWith(`@${expectedRecipient.split('@')[1]}>`));

  return hasContactGroupListHeader && hasContactGroupSender;
}

export function validateEmailRoute(
  email: ParsedInboundEmail,
  deps: EmailIntakeDeps,
): { ok: boolean; status: string } {
  const expectedRoute = deps.config.googleRouteHeaderValue.trim();
  const routeHeader = email.header('x-craigs-google-route').trim();
  if (!expectedRoute || routeHeader !== expectedRoute) {
    return { ok: false, status: 'missing_expected_google_route' };
  }

  return { ok: true, status: 'google_workspace_route' };
}

export function getEmailPreAiSkipReason(
  email: ParsedInboundEmail,
  args: { originalRecipient: string },
): string | null {
  const from = email.from?.address.toLowerCase() ?? '';
  const autoSubmitted = email.header('auto-submitted').toLowerCase();
  const precedence = email.header('precedence').toLowerCase();
  const contentType = email.header('content-type').toLowerCase();
  const subject = email.subject.toLowerCase();
  const trustedContactGroupRoute = isTrustedContactGroupRoute(email, args.originalRecipient);

  if (from.endsWith('@craigs.autos')) return 'internal_sender';
  if (email.inReplyTo || email.references) return 'existing_email_thread';
  if (autoSubmitted && autoSubmitted !== 'no') return 'auto_submitted';
  if (['bulk', 'junk'].includes(precedence)) return 'bulk_or_list';
  if (precedence === 'list' && !trustedContactGroupRoute) return 'bulk_or_list';
  if (email.header('list-id') && !trustedContactGroupRoute) return 'mailing_list';
  if (from.startsWith('mailer-daemon@') || from.startsWith('postmaster@')) return 'mailer_daemon';
  if (contentType.includes('multipart/report')) return 'delivery_report';
  if (subject.includes('delivery status notification') || subject.includes('undeliverable')) {
    return 'delivery_failure';
  }
  return null;
}
