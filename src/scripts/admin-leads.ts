import { createAdminLeadsApi, isAdminUnauthorizedError } from './admin-leads/api';
import { clearAdminAuth, readAdminAuth, writeAdminAuth } from './admin-leads/auth-storage';
import { renderAdminLeads } from './admin-leads/render';
import type { AdminLeadsActions, AdminLeadsState, QualificationFilter } from './admin-leads/types';

export const initAdminLeads = (app = document.getElementById('admin-leads-app')) => {
  if (!(app instanceof HTMLElement)) {
    return;
  }

  const api = createAdminLeadsApi();
  const state: AdminLeadsState = {
    auth: readAdminAuth(),
    loading: false,
    leadRecords: [],
    journeys: [],
    error: null,
    filterQualified: '',
    recordsCursor: null,
    journeysCursor: null,
  };

  const clearAuth = () => {
    state.auth = '';
    clearAdminAuth();
  };

  const fetchLeads = async (reset: boolean) => {
    if (!state.auth) {
      return;
    }

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
      const data = await api.fetchLeads({
        auth: state.auth,
        recordsCursor: state.recordsCursor,
        journeysCursor: state.journeysCursor,
        qualifiedFilter: state.filterQualified,
      });
      state.leadRecords = data.lead_records || [];
      state.journeys = data.journeys || [];
      state.recordsCursor = data.next_records_cursor || null;
      state.journeysCursor = data.next_journeys_cursor || null;
      state.loading = false;
      render();
    } catch (error) {
      if (isAdminUnauthorizedError(error)) {
        clearAuth();
      }
      state.loading = false;
      state.error = error instanceof Error ? error.message : 'Failed to load.';
      render();
    }
  };

  const updateLead = async (leadRecordId: string, qualified: boolean) => {
    state.loading = true;
    render();

    try {
      await api.updateLead({
        auth: state.auth,
        leadRecordId,
        qualified,
      });
      await fetchLeads(true);
    } catch (error) {
      if (isAdminUnauthorizedError(error)) {
        clearAuth();
      }
      state.loading = false;
      state.error = error instanceof Error ? error.message : 'Update failed.';
      render();
    }
  };

  const onLogin = (password: string) => {
    const token = btoa(`admin:${password}`);
    state.auth = `Basic ${token}`;
    writeAdminAuth(state.auth);
    void fetchLeads(true);
  };

  const logout = () => {
    clearAuth();
    render();
  };

  const setFilter = (value: QualificationFilter) => {
    state.filterQualified = value;
    void fetchLeads(true);
  };

  const actions: AdminLeadsActions = {
    onFilterChange: setFilter,
    onLogin,
    onLogout: logout,
    onRefresh: () => void fetchLeads(true),
    onUpdateLead: (leadRecordId, qualified) => void updateLead(leadRecordId, qualified),
  };

  const render = () => {
    renderAdminLeads(app, state, actions);
  };

  render();
  if (state.auth) {
    void fetchLeads(true);
  }
};
