const STORAGE_KEY = 'lead_admin_auth';
const OUTPUTS_PATH = '/amplify_outputs.json';
const FETCH_TIMEOUT_MS = 8_000;

type LeadRecordItem = {
  lead_record_id?: string;
  journey_id?: string;
  created_at_ms?: number;
  updated_at_ms?: number;
  status?: string;
  capture_channel?: string;
  first_action?: string | null;
  latest_action?: string | null;
  action_count?: number;
  title?: string;
  display_name?: string | null;
  normalized_phone?: string | null;
  normalized_email?: string | null;
  device_type?: string;
  source_platform?: string;
  acquisition_class?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  click_id_type?: string | null;
  click_id?: string | null;
  qualified?: boolean;
  uploaded_google_ads?: boolean;
  outreach_channel?: string | null;
  outreach_status?: string | null;
};

type JourneyItem = {
  journey_id?: string;
  lead_record_id?: string | null;
  journey_status?: string;
  status_reason?: string | null;
  capture_channel?: string | null;
  first_action?: string | null;
  latest_action?: string | null;
  action_types?: string[];
  action_count?: number;
  thread_id?: string | null;
  lead_user_id?: string | null;
  source_platform?: string | null;
  acquisition_class?: string | null;
  landing_page?: string | null;
  referrer_host?: string | null;
  created_at_ms?: number;
  updated_at_ms?: number;
};

type LeadsApiResponse = {
  lead_records?: LeadRecordItem[];
  journeys?: JourneyItem[];
  next_records_cursor?: string | null;
  next_journeys_cursor?: string | null;
};

export const initAdminLeads = (app = document.getElementById('admin-leads-app')) => {
  if (!(app instanceof HTMLElement)) {
    return;
  }

  const state = {
    endpoint: null as string | null,
    auth: sessionStorage.getItem(STORAGE_KEY) || '',
    loading: false,
    leadRecords: [] as LeadRecordItem[],
    journeys: [] as JourneyItem[],
    error: null as string | null,
    filterQualified: '',
    recordsCursor: null as string | null,
    journeysCursor: null as string | null,
  };

  const setError = (message: string | null) => {
    state.error = message;
    render();
  };

  const withFetchTimeout = (options: RequestInit = {}) => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    }
    return options;
  };

  const resolveEndpoint = async (): Promise<string | null> => {
    if (state.endpoint) return state.endpoint;
    const res = await fetch(OUTPUTS_PATH, withFetchTimeout({ cache: 'no-store' }));
    if (!res.ok) return null;
    const data = (await res.json()) as { custom?: { chatkit_lead_admin_url?: string } };
    const url = data?.custom?.chatkit_lead_admin_url;
    if (typeof url === 'string' && url.trim()) {
      state.endpoint = url.trim();
      return state.endpoint;
    }
    return null;
  };

  const jsonHeaders = () => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (state.auth) headers.set('Authorization', state.auth);
    return headers;
  };

  const fetchLeads = async (reset: boolean) => {
    if (!state.auth) return;
    state.loading = true;
    state.error = null;
    if (reset) {
      state.leadRecords = [];
      state.journeys = [];
      state.recordsCursor = null;
      state.journeysCursor = null;
    }
    render();

    try {
      const endpoint = await resolveEndpoint();
      if (!endpoint) throw new Error('Missing admin endpoint.');

      const url = new URL(endpoint);
      url.searchParams.set('limit', '200');
      if (state.recordsCursor) url.searchParams.set('records_cursor', state.recordsCursor);
      if (state.journeysCursor) url.searchParams.set('journeys_cursor', state.journeysCursor);
      if (state.filterQualified) url.searchParams.set('qualified', state.filterQualified);

      const res = await fetch(
        url.toString(),
        withFetchTimeout({
          method: 'GET',
          headers: jsonHeaders(),
        }),
      );

      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        state.auth = '';
        throw new Error('Unauthorized.');
      }
      if (!res.ok) throw new Error('Failed to load leads.');

      const data = (await res.json()) as LeadsApiResponse;
      state.leadRecords = data.lead_records || [];
      state.journeys = data.journeys || [];
      state.recordsCursor = data.next_records_cursor || null;
      state.journeysCursor = data.next_journeys_cursor || null;
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      setError(error instanceof Error ? error.message : 'Failed to load.');
    }
  };

  const updateLead = async (leadRecordId: string, qualified: boolean) => {
    state.loading = true;
    render();
    try {
      const endpoint = await resolveEndpoint();
      if (!endpoint) throw new Error('Missing admin endpoint.');

      const res = await fetch(
        endpoint,
        withFetchTimeout({
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ lead_record_id: leadRecordId, qualified }),
        }),
      );

      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        state.auth = '';
        throw new Error('Unauthorized.');
      }
      if (!res.ok) throw new Error('Update failed.');
      await res.json();
      await fetchLeads(true);
    } catch (error) {
      state.loading = false;
      setError(error instanceof Error ? error.message : 'Update failed.');
    }
  };

  const onLogin = (password: string) => {
    const token = btoa(`admin:${password}`);
    state.auth = `Basic ${token}`;
    sessionStorage.setItem(STORAGE_KEY, state.auth);
    void fetchLeads(true);
  };

  const logout = () => {
    state.auth = '';
    sessionStorage.removeItem(STORAGE_KEY);
    render();
  };

  const renderLogin = () => {
    app.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'admin-card';

    const row = document.createElement('div');
    row.className = 'admin-row';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Admin password';

    const button = document.createElement('button');
    button.textContent = 'Sign in';
    button.addEventListener('click', () => {
      if (!input.value) return;
      onLogin(input.value);
    });

    row.append(input, button);
    card.appendChild(row);

    if (state.error) {
      const err = document.createElement('p');
      err.className = 'muted';
      err.textContent = state.error;
      card.appendChild(err);
    }

    app.appendChild(card);
  };

  const renderTable = () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-card';

    const toolbar = document.createElement('div');
    toolbar.className = 'admin-row';

    const filterSelect = document.createElement('select');
    filterSelect.innerHTML =
      '<option value="">All records</option>' +
      '<option value="true">Qualified</option>' +
      '<option value="false">Unqualified</option>';
    filterSelect.value = state.filterQualified;
    filterSelect.addEventListener('change', () => {
      state.filterQualified = filterSelect.value;
      void fetchLeads(true);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh';
    refreshBtn.className = 'secondary';
    refreshBtn.addEventListener('click', () => void fetchLeads(true));

    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Log out';
    logoutBtn.className = 'secondary';
    logoutBtn.addEventListener('click', logout);

    toolbar.append(filterSelect, refreshBtn, logoutBtn);
    wrapper.appendChild(toolbar);

    const recordsHeading = document.createElement('h2');
    recordsHeading.textContent = 'Lead Records';
    recordsHeading.style.margin = '0 0 8px';
    recordsHeading.style.fontSize = '1.1rem';
    wrapper.appendChild(recordsHeading);

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Date</th>' +
      '<th>Capture</th>' +
      '<th>Lead</th>' +
      '<th>Source</th>' +
      '<th>Actions</th>' +
      '<th>Contact</th>' +
      '<th>Status</th>' +
      '<th>Google Ads</th>' +
      '<th>Action</th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');
    if (!state.leadRecords.length && !state.loading) {
      const empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="9" class="muted">No lead records found.</td>';
      tbody.appendChild(empty);
    } else {
      for (const item of state.leadRecords) {
        const tr = document.createElement('tr');
        const created = item.created_at_ms ? new Date(item.created_at_ms).toLocaleString() : '-';
        const capture = item.capture_channel || '-';
        const title = item.title || '-';
        const device = item.device_type || '-';
        const contactParts = [
          item.display_name,
          item.normalized_phone,
          item.normalized_email,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0);
        const contact = contactParts.length ? contactParts.join(' • ') : '-';
        const source = item.source_platform || item.utm_source || '-';
        const actionPath =
          [item.first_action, item.latest_action].filter(Boolean).join(' -> ') || '-';
        const qualified = item.qualified === true;
        const uploadedGoogleAds = item.uploaded_google_ads === true;
        const statusLabel = qualified ? 'Qualified' : item.status || 'New';

        tr.innerHTML =
          `<td>${created}</td>` +
          `<td>${capture}</td>` +
          `<td>${title}<br><span class="muted">${device}</span></td>` +
          `<td>${source}</td>` +
          `<td>${actionPath}<br><span class="muted">${item.action_count ?? 0} events</span></td>` +
          `<td>${contact}</td>` +
          '<td>' +
          `<span class="badge ${qualified ? 'badge--yes' : 'badge--no'}">${statusLabel}</span>` +
          '</td>' +
          '<td>' +
          (uploadedGoogleAds
            ? '<span class="badge badge--yes">Uploaded</span>'
            : '<span class="badge badge--no">Pending</span>') +
          '</td>';

        const actionCell = document.createElement('td');
        const actionBtn = document.createElement('button');
        actionBtn.className = 'secondary';
        actionBtn.textContent = qualified ? 'Unqualify' : 'Qualify';
        actionBtn.addEventListener('click', () => {
          if (!item.lead_record_id) return;
          void updateLead(item.lead_record_id, !qualified);
        });
        actionCell.appendChild(actionBtn);
        tr.appendChild(actionCell);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

    const journeysHeading = document.createElement('h2');
    journeysHeading.textContent = 'Journeys';
    journeysHeading.style.margin = '28px 0 4px';
    journeysHeading.style.fontSize = '1.1rem';
    wrapper.appendChild(journeysHeading);

    const journeyNote = document.createElement('p');
    journeyNote.className = 'muted';
    journeyNote.textContent =
      'Journeys include soft-intent behavior and incomplete chat flows, even when no lead record was captured.';
    wrapper.appendChild(journeyNote);

    const journeysTable = document.createElement('table');
    journeysTable.className = 'admin-table';
    journeysTable.innerHTML =
      '<thead><tr>' +
      '<th>Updated</th>' +
      '<th>Status</th>' +
      '<th>Capture</th>' +
      '<th>Actions</th>' +
      '<th>Source</th>' +
      '<th>Reason</th>' +
      '<th>Linked Record</th>' +
      '</tr></thead>';

    const journeysBody = document.createElement('tbody');
    if (!state.journeys.length && !state.loading) {
      const empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="7" class="muted">No journeys found.</td>';
      journeysBody.appendChild(empty);
    } else {
      for (const journey of state.journeys) {
        const tr = document.createElement('tr');
        const updated = journey.updated_at_ms
          ? new Date(journey.updated_at_ms).toLocaleString()
          : '-';
        const actionList =
          Array.isArray(journey.action_types) && journey.action_types.length
            ? journey.action_types.join(', ')
            : '-';
        const source =
          [journey.source_platform, journey.acquisition_class].filter(Boolean).join(' • ') ||
          journey.landing_page ||
          '-';
        tr.innerHTML =
          `<td>${updated}</td>` +
          `<td>${journey.journey_status || '-'}</td>` +
          `<td>${journey.capture_channel || '-'}</td>` +
          `<td>${actionList}<br><span class="muted">${journey.action_count ?? 0} events</span></td>` +
          `<td>${source}</td>` +
          `<td>${journey.status_reason || '-'}</td>` +
          `<td>${journey.lead_record_id || '-'}</td>`;
        journeysBody.appendChild(tr);
      }
    }

    journeysTable.appendChild(journeysBody);
    wrapper.appendChild(journeysTable);

    if (state.loading) {
      const loading = document.createElement('p');
      loading.className = 'muted';
      loading.textContent = 'Loading...';
      wrapper.appendChild(loading);
    }

    if (state.error) {
      const err = document.createElement('p');
      err.className = 'muted';
      err.textContent = state.error;
      wrapper.appendChild(err);
    }

    app.appendChild(wrapper);
  };

  const render = () => {
    app.innerHTML = '';
    if (!state.auth) {
      renderLogin();
      return;
    }
    renderTable();
  };

  render();
  if (state.auth) {
    void fetchLeads(true);
  }
};
