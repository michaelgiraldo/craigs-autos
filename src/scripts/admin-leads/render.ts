import {
  appendStackedTextCell,
  appendTextCell,
  createBadge,
  createButton,
  createEmptyRow,
  createTable,
  createTextElement,
} from './dom';
import {
  formatDate,
  formatJourneyActions,
  formatJourneySource,
  formatLeadActionPath,
  formatLeadContact,
  formatLeadSource,
  optionalString,
  stringOrDash,
  toQualificationFilter,
} from './formatters';
import type { AdminLeadsActions, AdminLeadsState, JourneyItem, LeadRecordItem } from './types';

const RECORD_COLUMNS = [
  'Date',
  'Capture',
  'Lead',
  'Source',
  'Actions',
  'Contact',
  'Status',
  'Google Ads',
  'Action',
];

const JOURNEY_COLUMNS = [
  'Updated',
  'Status',
  'Capture',
  'Actions',
  'Source',
  'Reason',
  'Linked Record',
];

function renderLogin(app: HTMLElement, state: AdminLeadsState, actions: AdminLeadsActions): void {
  const card = document.createElement('div');
  card.className = 'admin-card';

  const row = document.createElement('div');
  row.className = 'admin-row';

  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'Admin password';

  const button = createButton('Sign in');
  button.addEventListener('click', () => {
    if (!input.value) {
      return;
    }
    actions.onLogin(input.value);
  });

  row.append(input, button);
  card.appendChild(row);

  if (state.error) {
    card.appendChild(createTextElement('p', state.error, 'muted'));
  }

  app.appendChild(card);
}

function renderToolbar(state: AdminLeadsState, actions: AdminLeadsActions): HTMLDivElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-row';

  const filterSelect = document.createElement('select');
  for (const option of [
    { value: '', label: 'All records' },
    { value: 'true', label: 'Qualified' },
    { value: 'false', label: 'Unqualified' },
  ]) {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    filterSelect.appendChild(optionElement);
  }
  filterSelect.value = state.filterQualified;
  filterSelect.addEventListener('change', () => {
    actions.onFilterChange(toQualificationFilter(filterSelect.value));
  });

  const refreshButton = createButton('Refresh', 'secondary');
  refreshButton.addEventListener('click', actions.onRefresh);

  const logoutButton = createButton('Log out', 'secondary');
  logoutButton.addEventListener('click', actions.onLogout);

  toolbar.append(filterSelect, refreshButton, logoutButton);
  return toolbar;
}

function renderLeadRecordRow(
  item: LeadRecordItem,
  actions: AdminLeadsActions,
): HTMLTableRowElement {
  const row = document.createElement('tr');
  const qualified = item.qualified === true;
  const uploadedGoogleAds = item.uploaded_google_ads === true;
  const statusLabel = qualified ? 'Qualified' : item.status || 'New';

  appendTextCell(row, formatDate(item.created_at_ms));
  appendTextCell(row, stringOrDash(item.capture_channel));
  appendStackedTextCell(
    row,
    stringOrDash(item.title),
    optionalString(item.device_type) ?? undefined,
  );
  appendTextCell(row, formatLeadSource(item));
  appendStackedTextCell(row, formatLeadActionPath(item), `${item.action_count ?? 0} events`);
  appendTextCell(row, formatLeadContact(item));

  const statusCell = document.createElement('td');
  statusCell.appendChild(createBadge(statusLabel, qualified));
  row.appendChild(statusCell);

  const googleAdsCell = document.createElement('td');
  googleAdsCell.appendChild(
    createBadge(uploadedGoogleAds ? 'Uploaded' : 'Pending', uploadedGoogleAds),
  );
  row.appendChild(googleAdsCell);

  const actionCell = document.createElement('td');
  const actionButton = createButton(qualified ? 'Unqualify' : 'Qualify', 'secondary');
  actionButton.addEventListener('click', () => {
    if (!item.lead_record_id) {
      return;
    }
    actions.onUpdateLead(item.lead_record_id, !qualified);
  });
  actionCell.appendChild(actionButton);
  row.appendChild(actionCell);

  return row;
}

function renderLeadRecordsTable(
  state: AdminLeadsState,
  actions: AdminLeadsActions,
): HTMLTableElement {
  const table = createTable(RECORD_COLUMNS);
  const tbody = document.createElement('tbody');

  if (!state.leadRecords.length && !state.loading) {
    tbody.appendChild(createEmptyRow(RECORD_COLUMNS.length, 'No lead records found.'));
  } else {
    for (const item of state.leadRecords) {
      tbody.appendChild(renderLeadRecordRow(item, actions));
    }
  }

  table.appendChild(tbody);
  return table;
}

function renderJourneyRow(journey: JourneyItem): HTMLTableRowElement {
  const row = document.createElement('tr');
  appendTextCell(row, formatDate(journey.updated_at_ms));
  appendTextCell(row, stringOrDash(journey.journey_status));
  appendTextCell(row, stringOrDash(journey.capture_channel));
  appendStackedTextCell(row, formatJourneyActions(journey), `${journey.action_count ?? 0} events`);
  appendTextCell(row, formatJourneySource(journey));
  appendTextCell(row, stringOrDash(journey.status_reason));
  appendTextCell(row, stringOrDash(journey.lead_record_id));
  return row;
}

function renderJourneysTable(state: AdminLeadsState): HTMLTableElement {
  const table = createTable(JOURNEY_COLUMNS);
  const tbody = document.createElement('tbody');

  if (!state.journeys.length && !state.loading) {
    tbody.appendChild(createEmptyRow(JOURNEY_COLUMNS.length, 'No journeys found.'));
  } else {
    for (const journey of state.journeys) {
      tbody.appendChild(renderJourneyRow(journey));
    }
  }

  table.appendChild(tbody);
  return table;
}

function renderDashboard(
  app: HTMLElement,
  state: AdminLeadsState,
  actions: AdminLeadsActions,
): void {
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-card';

  wrapper.appendChild(renderToolbar(state, actions));

  const recordsHeading = createTextElement('h2', 'Lead Records');
  recordsHeading.style.margin = '0 0 8px';
  recordsHeading.style.fontSize = '1.1rem';
  wrapper.appendChild(recordsHeading);
  wrapper.appendChild(renderLeadRecordsTable(state, actions));

  const journeysHeading = createTextElement('h2', 'Journeys');
  journeysHeading.style.margin = '28px 0 4px';
  journeysHeading.style.fontSize = '1.1rem';
  wrapper.appendChild(journeysHeading);
  wrapper.appendChild(
    createTextElement(
      'p',
      'Journeys include soft-intent behavior and incomplete chat flows, even when no lead record was captured.',
      'muted',
    ),
  );
  wrapper.appendChild(renderJourneysTable(state));

  if (state.loading) {
    wrapper.appendChild(createTextElement('p', 'Loading...', 'muted'));
  }

  if (state.error) {
    wrapper.appendChild(createTextElement('p', state.error, 'muted'));
  }

  app.appendChild(wrapper);
}

export function renderAdminLeads(
  app: HTMLElement,
  state: AdminLeadsState,
  actions: AdminLeadsActions,
): void {
  app.replaceChildren();

  if (!state.auth) {
    renderLogin(app, state, actions);
    return;
  }

  renderDashboard(app, state, actions);
}
