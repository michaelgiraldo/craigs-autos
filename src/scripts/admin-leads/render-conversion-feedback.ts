import { createBadge, createTextElement } from './dom';
import { formatDate, optionalString, stringOrDash } from './formatters';
import type {
  ConversionFeedbackDecisionItem,
  ConversionFeedbackOutcomeItem,
  ConversionFeedbackOutboxItem,
  LeadRecordItem,
} from './types';

function isPositiveFeedbackStatus(status: string | null): boolean {
  return (
    status === 'ready' ||
    status === 'queued' ||
    status === 'validated' ||
    status === 'manual' ||
    status === 'sent' ||
    status === 'accepted' ||
    status === 'attributed'
  );
}

function appendDetailLine(parent: HTMLElement, label: string, value: string | null): void {
  if (!value) return;
  const line = document.createElement('div');
  line.className = 'admin-detail-line';
  line.append(createTextElement('strong', `${label}: `), document.createTextNode(value));
  parent.appendChild(line);
}

function createSafeDiagnosticsLink(url: string | null): HTMLAnchorElement | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const link = document.createElement('a');
    link.href = parsed.toString();
    link.textContent = 'Diagnostics';
    link.target = '_blank';
    link.rel = 'noreferrer';
    return link;
  } catch {
    return null;
  }
}

function formatSignals(signals: string[] | undefined): string | null {
  return Array.isArray(signals) && signals.length ? signals.join(', ') : null;
}

function formatOptionalDate(ms: number | null | undefined): string | null {
  return typeof ms === 'number' ? formatDate(ms) : null;
}

function renderDecisionCard(decision: ConversionFeedbackDecisionItem): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'admin-detail-card';
  const status = optionalString(decision.decision_status);
  const header = document.createElement('div');
  header.className = 'admin-detail-card__header';
  header.append(
    createTextElement('strong', stringOrDash(decision.decision_type)),
    createBadge(stringOrDash(status), status === 'active'),
  );
  card.appendChild(header);
  appendDetailLine(card, 'Actor', optionalString(decision.actor));
  appendDetailLine(card, 'Reason', optionalString(decision.reason));
  appendDetailLine(card, 'Occurred', formatOptionalDate(decision.occurred_at_ms));
  if (typeof decision.conversion_value === 'number') {
    appendDetailLine(
      card,
      'Value',
      `${decision.conversion_value} ${optionalString(decision.currency_code) ?? ''}`.trim(),
    );
  }
  return card;
}

function renderOutcomeCard(outcome: ConversionFeedbackOutcomeItem): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'admin-detail-card';
  const status = optionalString(outcome.status);
  const header = document.createElement('div');
  header.className = 'admin-detail-card__header';
  header.append(
    createTextElement('strong', stringOrDash(status)),
    createTextElement('span', formatDate(outcome.occurred_at_ms), 'muted'),
  );
  card.appendChild(header);
  appendDetailLine(card, 'Message', optionalString(outcome.message));
  appendDetailLine(card, 'Error', optionalString(outcome.error_code));
  appendDetailLine(card, 'Provider response', optionalString(outcome.provider_response_id));
  const diagnosticsLink = createSafeDiagnosticsLink(optionalString(outcome.diagnostics_url));
  if (diagnosticsLink) {
    const line = document.createElement('div');
    line.className = 'admin-detail-line';
    line.append(createTextElement('strong', 'Diagnostics: '), diagnosticsLink);
    card.appendChild(line);
  }
  return card;
}

function renderOutboxCard(item: ConversionFeedbackOutboxItem): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'admin-detail-card';
  const status = optionalString(item.status);
  const header = document.createElement('div');
  header.className = 'admin-detail-card__header';
  header.append(
    createTextElement('strong', stringOrDash(item.destination_label)),
    createBadge(stringOrDash(status), isPositiveFeedbackStatus(status)),
  );
  card.appendChild(header);
  appendDetailLine(card, 'Reason', optionalString(item.status_reason));
  appendDetailLine(card, 'Signals', formatSignals(item.signal_keys));
  appendDetailLine(card, 'Attempts', String(item.attempt_count ?? 0));
  appendDetailLine(card, 'Next attempt', formatOptionalDate(item.next_attempt_at_ms));
  appendDetailLine(card, 'Lease expires', formatOptionalDate(item.lease_expires_at_ms));
  appendDetailLine(card, 'Latest outcome', optionalString(item.latest_outcome?.status));
  appendDetailLine(card, 'Outcome message', optionalString(item.latest_outcome?.message));
  return card;
}

function appendDetailSection<T>(
  parent: HTMLElement,
  title: string,
  items: T[],
  renderItem: (item: T) => HTMLElement,
): void {
  if (!items.length) return;
  parent.appendChild(createTextElement('h3', title, 'admin-detail-section-title'));
  const list = document.createElement('div');
  list.className = 'admin-detail-list';
  for (const item of items) {
    list.appendChild(renderItem(item));
  }
  parent.appendChild(list);
}

export function renderConversionFeedbackDetail(item: LeadRecordItem): HTMLDetailsElement | null {
  const detail = item.conversion_feedback_detail;
  const decisions = detail?.decisions ?? [];
  const outboxItems = detail?.outbox_items ?? [];
  const outcomes = detail?.outcomes ?? [];
  const count = decisions.length + outboxItems.length + outcomes.length;
  if (!count) return null;

  const details = document.createElement('details');
  details.className = 'admin-details';
  details.appendChild(
    createTextElement(
      'summary',
      `${decisions.length} decisions • ${outboxItems.length} destinations • ${outcomes.length} outcomes`,
    ),
  );
  appendDetailSection(details, 'Decisions', decisions, renderDecisionCard);
  appendDetailSection(details, 'Destination state', outboxItems, renderOutboxCard);
  appendDetailSection(details, 'Recent outcomes', outcomes.slice(0, 5), renderOutcomeCard);
  return details;
}
