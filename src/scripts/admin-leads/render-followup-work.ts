import {
  appendStackedTextCell,
  appendTextCell,
  createBadge,
  createButton,
  createEmptyRow,
  createTable,
  createTextElement,
} from './dom';
import { formatDate, optionalString, stringOrDash } from './formatters';
import type { AdminLeadsActions, AdminLeadsState, FollowupWorkItem } from './types';

const FOLLOWUP_COLUMNS = ['Updated', 'Status', 'Source', 'Lead', 'Delivery', 'Issue', 'Action'];

function formatEpochSeconds(seconds: number | null | undefined): string {
  return typeof seconds === 'number' ? formatDate(seconds * 1000) : '-';
}

function formatFollowupLead(item: FollowupWorkItem): string {
  const parts = [
    optionalString(item.name),
    optionalString(item.vehicle),
    optionalString(item.service),
    optionalString(item.phone),
    optionalString(item.email),
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(' • ') : stringOrDash(item.lead_record_id);
}

function formatFollowupDelivery(item: FollowupWorkItem): string {
  return [
    `SMS ${stringOrDash(item.sms_status)}`,
    `Email ${stringOrDash(item.email_status)}`,
    `Lead notification ${stringOrDash(item.lead_notification_status)}`,
  ].join(' • ');
}

function renderFollowupWorkRow(
  item: FollowupWorkItem,
  state: AdminLeadsState,
  actions: AdminLeadsActions,
): HTMLTableRowElement {
  const row = document.createElement('tr');
  const idempotencyKey = optionalString(item.idempotency_key);
  const status = optionalString(item.status);

  appendTextCell(row, formatEpochSeconds(item.updated_at));
  const statusCell = document.createElement('td');
  statusCell.appendChild(createBadge(stringOrDash(status), status === 'completed'));
  if (item.stale) {
    statusCell.appendChild(document.createElement('br'));
    statusCell.appendChild(createTextElement('span', 'Stale', 'muted'));
  }
  row.appendChild(statusCell);
  appendStackedTextCell(row, stringOrDash(item.capture_channel), stringOrDash(item.origin));
  appendStackedTextCell(row, formatFollowupLead(item), stringOrDash(idempotencyKey));
  appendTextCell(row, formatFollowupDelivery(item));
  appendStackedTextCell(
    row,
    stringOrDash(item.error ?? item.action_block_reason),
    item.operator_resolution_reason ?? undefined,
  );

  const actionCell = document.createElement('td');
  const retryButton = createButton('Retry', 'secondary');
  retryButton.disabled = !idempotencyKey || item.retry_allowed !== true || state.loading;
  retryButton.addEventListener('click', () => {
    if (idempotencyKey) actions.onRetryFollowupWork(idempotencyKey);
  });
  const manualButton = createButton('Manual', 'secondary');
  manualButton.disabled =
    !idempotencyKey || item.manual_resolution_allowed !== true || state.loading;
  manualButton.addEventListener('click', () => {
    if (idempotencyKey) actions.onResolveFollowupWorkManually(idempotencyKey);
  });
  actionCell.append(retryButton, document.createTextNode(' '), manualButton);
  row.appendChild(actionCell);

  return row;
}

export function renderFollowupWorkTable(
  state: AdminLeadsState,
  actions: AdminLeadsActions,
): HTMLTableElement {
  const table = createTable(FOLLOWUP_COLUMNS);
  const tbody = document.createElement('tbody');

  if (!state.followupWork.length && !state.loading) {
    tbody.appendChild(createEmptyRow(FOLLOWUP_COLUMNS.length, 'No active follow-up work found.'));
  } else {
    for (const item of state.followupWork) {
      tbody.appendChild(renderFollowupWorkRow(item, state, actions));
    }
  }

  table.appendChild(tbody);
  return table;
}
