(function () {
  var STORAGE_KEY = 'craigs_admin_auth';
  var OUTPUTS_PATH = '/amplify_outputs.json';
  var app = document.getElementById('admin-leads-app');
  if (!app) return;

  var state = {
    endpoint: null,
    auth: sessionStorage.getItem(STORAGE_KEY) || '',
    loading: false,
    items: [],
    error: null,
    filterQualified: '',
    cursor: null,
  };

  function setError(msg) {
    state.error = msg || null;
    render();
  }

  function resolveEndpoint() {
    if (state.endpoint) return Promise.resolve(state.endpoint);
    return fetch(OUTPUTS_PATH, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        var url = data && data.custom && data.custom.chatkit_lead_admin_url;
        if (typeof url === 'string' && url.trim()) {
          state.endpoint = url.trim();
          return state.endpoint;
        }
        return null;
      });
  }

  function authHeader() {
    return state.auth ? { Authorization: state.auth } : {};
  }

  function fetchLeads(reset) {
    if (!state.auth) return;
    state.loading = true;
    state.error = null;
    if (reset) {
      state.items = [];
      state.cursor = null;
    }
    render();

    resolveEndpoint()
      .then(function (endpoint) {
        if (!endpoint) throw new Error('Missing admin endpoint.');
        var url = new URL(endpoint);
        url.searchParams.set('limit', '200');
        if (state.cursor) url.searchParams.set('cursor', state.cursor);
        if (state.filterQualified) url.searchParams.set('qualified', state.filterQualified);

        return fetch(url.toString(), {
          method: 'GET',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
        });
      })
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem(STORAGE_KEY);
          state.auth = '';
          throw new Error('Unauthorized.');
        }
        if (!res.ok) throw new Error('Failed to load leads.');
        return res.json();
      })
      .then(function (data) {
        state.items = data.items || [];
        state.cursor = data.next_cursor || null;
        state.loading = false;
        render();
      })
      .catch(function (err) {
        state.loading = false;
        setError(err.message || 'Failed to load.');
      });
  }

  function updateLead(leadId, qualified) {
    state.loading = true;
    render();
    resolveEndpoint()
      .then(function (endpoint) {
        if (!endpoint) throw new Error('Missing admin endpoint.');
        return fetch(endpoint, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
          body: JSON.stringify({ lead_id: leadId, qualified: qualified }),
        });
      })
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem(STORAGE_KEY);
          state.auth = '';
          throw new Error('Unauthorized.');
        }
        if (!res.ok) throw new Error('Update failed.');
        return res.json();
      })
      .then(function () {
        fetchLeads(true);
      })
      .catch(function (err) {
        state.loading = false;
        setError(err.message || 'Update failed.');
      });
  }

  function onLogin(password) {
    var token = btoa('admin:' + password);
    state.auth = 'Basic ' + token;
    sessionStorage.setItem(STORAGE_KEY, state.auth);
    fetchLeads(true);
  }

  function logout() {
    state.auth = '';
    sessionStorage.removeItem(STORAGE_KEY);
    render();
  }

  function renderLogin() {
    app.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'admin-card';

    var row = document.createElement('div');
    row.className = 'admin-row';

    var input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Admin password';

    var button = document.createElement('button');
    button.textContent = 'Sign in';
    button.addEventListener('click', function () {
      if (!input.value) return;
      onLogin(input.value);
    });

    row.appendChild(input);
    row.appendChild(button);
    card.appendChild(row);

    if (state.error) {
      var err = document.createElement('p');
      err.className = 'muted';
      err.textContent = state.error;
      card.appendChild(err);
    }

    app.appendChild(card);
  }

  function renderTable() {
    var wrapper = document.createElement('div');
    wrapper.className = 'admin-card';

    var toolbar = document.createElement('div');
    toolbar.className = 'admin-row';

    var filterSelect = document.createElement('select');
    filterSelect.innerHTML =
      '<option value="">All</option>' +
      '<option value="true">Qualified</option>' +
      '<option value="false">Unqualified</option>';
    filterSelect.value = state.filterQualified;
    filterSelect.addEventListener('change', function () {
      state.filterQualified = filterSelect.value;
      fetchLeads(true);
    });

    var refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh';
    refreshBtn.className = 'secondary';
    refreshBtn.addEventListener('click', function () {
      fetchLeads(true);
    });

    var logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Log out';
    logoutBtn.className = 'secondary';
    logoutBtn.addEventListener('click', logout);

    toolbar.appendChild(filterSelect);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(logoutBtn);
    wrapper.appendChild(toolbar);

    var table = document.createElement('table');
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

    var tbody = document.createElement('tbody');

    if (!state.items.length && !state.loading) {
      var empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="8" class="muted">No leads found.</td>';
      tbody.appendChild(empty);
    } else {
      state.items.forEach(function (item) {
        var tr = document.createElement('tr');
        var created = item.created_at
          ? new Date(item.created_at * 1000).toLocaleString()
          : '-';
        var method = item.lead_method || '-';
        var device = item.device_type || '-';
        var contact = item.customer_phone || item.customer_email || '-';
        var source = item.utm_source || '-';
        var gclid = item.gclid || item.gbraid || item.wbraid || '-';
        var qualified = item.qualified === true;

        tr.innerHTML =
          '<td>' + created + '</td>' +
          '<td>' + method + '</td>' +
          '<td>' + device + '</td>' +
          '<td>' + contact + '</td>' +
          '<td>' + source + '</td>' +
          '<td>' + gclid + '</td>' +
          '<td>' +
          (qualified
            ? '<span class="badge badge--yes">Qualified</span>'
            : '<span class="badge badge--no">No</span>') +
          '</td>';

        var actionCell = document.createElement('td');
        var actionBtn = document.createElement('button');
        actionBtn.className = 'secondary';
        actionBtn.textContent = qualified ? 'Unqualify' : 'Qualify';
        actionBtn.addEventListener('click', function () {
          updateLead(item.lead_id, !qualified);
        });
        actionCell.appendChild(actionBtn);
        tr.appendChild(actionCell);

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrapper.appendChild(table);

    if (state.loading) {
      var loading = document.createElement('p');
      loading.className = 'muted';
      loading.textContent = 'Loading...';
      wrapper.appendChild(loading);
    }

    if (state.error) {
      var err = document.createElement('p');
      err.className = 'muted';
      err.textContent = state.error;
      wrapper.appendChild(err);
    }

    app.appendChild(wrapper);
  }

  function render() {
    app.innerHTML = '';
    if (!state.auth) {
      renderLogin();
      return;
    }
    renderTable();
  }

  render();
  if (state.auth) {
    fetchLeads(true);
  }
})();
