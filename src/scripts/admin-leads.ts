const STORAGE_KEY = 'craigs_admin_auth';
const OUTPUTS_PATH = '/amplify_outputs.json';
const FETCH_TIMEOUT_MS = 8_000;

type LeadItem = {
  lead_id?: string;
  created_at?: number;
  lead_method?: string;
  device_type?: string;
  customer_phone?: string;
  customer_email?: string;
  utm_source?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  qualified?: boolean;
};

type LeadsApiResponse = {
  items?: LeadItem[];
  next_cursor?: string | null;
};

const app = document.getElementById('admin-leads-app');

if (app instanceof HTMLElement) {
  const state = {
    endpoint: null as string | null,
    auth: sessionStorage.getItem(STORAGE_KEY) || '',
    loading: false,
    items: [] as LeadItem[],
    error: null as string | null,
    filterQualified: '',
    cursor: null as string | null,
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

  const authHeader = () => (state.auth ? { Authorization: state.auth } : {});

  const fetchLeads = async (reset: boolean) => {
    if (!state.auth) return;
    state.loading = true;
    state.error = null;
    if (reset) {
      state.items = [];
      state.cursor = null;
    }
    render();

    try {
      const endpoint = await resolveEndpoint();
      if (!endpoint) throw new Error('Missing admin endpoint.');

      const url = new URL(endpoint);
      url.searchParams.set('limit', '200');
      if (state.cursor) url.searchParams.set('cursor', state.cursor);
      if (state.filterQualified) url.searchParams.set('qualified', state.filterQualified);

      const res = await fetch(
        url.toString(),
        withFetchTimeout({
          method: 'GET',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
        }),
      );

      if (res.status === 401) {
        sessionStorage.removeItem(STORAGE_KEY);
        state.auth = '';
        throw new Error('Unauthorized.');
      }
      if (!res.ok) throw new Error('Failed to load leads.');

      const data = (await res.json()) as LeadsApiResponse;
      state.items = data.items || [];
      state.cursor = data.next_cursor || null;
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      setError(error instanceof Error ? error.message : 'Failed to load.');
    }
  };

  const updateLead = async (leadId: string, qualified: boolean) => {
    state.loading = true;
    render();
    try {
      const endpoint = await resolveEndpoint();
      if (!endpoint) throw new Error('Missing admin endpoint.');

      const res = await fetch(
        endpoint,
        withFetchTimeout({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ lead_id: leadId, qualified }),
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
      '<option value="">All</option>' +
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
    refreshBtn.addEventListener('click', () => {
      void fetchLeads(true);
    });

    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Log out';
    logoutBtn.className = 'secondary';
    logoutBtn.addEventListener('click', logout);

    toolbar.append(filterSelect, refreshBtn, logoutBtn);
    wrapper.appendChild(toolbar);

    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML =
      '<thead><tr>' +
      '<th>Date</th>' +
      '<th>Method</th>' +
      '<th>Device</th>' +
      '<th>Contact</th>' +
      '<th>Source</th>' +
      '<th>GCLID</th>' +
      '<th>Status</th>' +
      '<th>Action</th>' +
      '</tr></thead>';

    const tbody = document.createElement('tbody');

    if (!state.items.length && !state.loading) {
      const empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="8" class="muted">No leads found.</td>';
      tbody.appendChild(empty);
    } else {
      for (const item of state.items) {
        const tr = document.createElement('tr');
        const created = item.created_at ? new Date(item.created_at * 1000).toLocaleString() : '-';
        const method = item.lead_method || '-';
        const device = item.device_type || '-';
        const contact = item.customer_phone || item.customer_email || '-';
        const source = item.utm_source || '-';
        const gclid = item.gclid || item.gbraid || item.wbraid || '-';
        const qualified = item.qualified === true;

        tr.innerHTML =
          `<td>${created}</td>` +
          `<td>${method}</td>` +
          `<td>${device}</td>` +
          `<td>${contact}</td>` +
          `<td>${source}</td>` +
          `<td>${gclid}</td>` +
          '<td>' +
          (qualified
            ? '<span class="badge badge--yes">Qualified</span>'
            : '<span class="badge badge--no">No</span>') +
          '</td>';

        const actionCell = document.createElement('td');
        const actionBtn = document.createElement('button');
        actionBtn.className = 'secondary';
        actionBtn.textContent = qualified ? 'Unqualify' : 'Qualify';
        actionBtn.addEventListener('click', () => {
          if (!item.lead_id) return;
          void updateLead(item.lead_id, !qualified);
        });
        actionCell.appendChild(actionBtn);
        tr.appendChild(actionCell);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

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
}
