import { useState } from 'react';
import { CHAT_COPY } from '../lib/site-data.js';
import {
  getAttributionForDataLayer,
  getAttributionPayload,
  getJourneyId,
  getLeadUserId,
} from '../lib/attribution.js';
import { resolveContactSubmitUrl } from '../lib/backend/amplify-outputs.ts';
import '../styles/contact-lead-form.css';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  vehicle: '',
  message: '',
  company: '',
};

function isEmailValid(email) {
  return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPhoneValid(phone) {
  return phone.trim() === '' || phone.replace(/[^\d]/g, '').length >= 7;
}

function createClientEventId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function pushLeadFormDataLayer(eventName, params, attribution) {
  try {
    const dataLayerWindow = window;
    dataLayerWindow.dataLayer = dataLayerWindow.dataLayer || [];
    dataLayerWindow.dataLayer.push({
      event: eventName,
      ...(attribution ?? {}),
      ...params,
    });
  } catch {
    // Ignore analytics failures.
  }
}

export default function ContactLeadForm({
  locale = 'en',
  serviceKey = 'contact',
  showHeader = true,
}) {
  const copy = CHAT_COPY[locale] ?? CHAT_COPY.en;
  const [form, setForm] = useState(initialForm);
  const [submitState, setSubmitState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const hasContactMethod = Boolean(form.phone.trim()) || Boolean(form.email.trim());
  const canSubmit =
    Boolean(form.name.trim()) &&
    hasContactMethod &&
    isEmailValid(form.email) &&
    isPhoneValid(form.phone);

  const onChange = (event) => {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const attributionPayload = getAttributionPayload();
    const attributionForDataLayer = getAttributionForDataLayer();
    const userId = getLeadUserId();
    const journeyId = getJourneyId();
    const clientEventId = createClientEventId('form');
    const occurredAtMs = Date.now();
    const pageUrl = window.location.href;
    const pagePath = window.location.pathname;

    if (!canSubmit) {
      event.currentTarget.reportValidity();
      setSubmitState('error');
      setErrorMessage(copy.errorBody);
      pushLeadFormDataLayer(
        'lead_form_submit_error',
        {
          error_code: 'validation_invalid_input',
          event_class: 'diagnostic',
          customer_action: 'form_submit',
          capture_channel: 'form',
          lead_strength: 'captured_lead',
          verification_status: 'unverified',
          locale,
          journey_id: journeyId,
          client_event_id: clientEventId,
          occurred_at_ms: occurredAtMs,
          page_path: pagePath,
          page_url: pageUrl,
          user_id: userId,
        },
        attributionForDataLayer,
      );
      return;
    }

    const endpoint = await resolveContactSubmitUrl();
    if (!endpoint) {
      setSubmitState('error');
      setErrorMessage(copy.errorBody);
      pushLeadFormDataLayer(
        'lead_form_submit_error',
        {
          error_code: 'missing_endpoint',
          event_class: 'diagnostic',
          customer_action: 'form_submit',
          capture_channel: 'form',
          lead_strength: 'captured_lead',
          verification_status: 'unverified',
          locale,
          journey_id: journeyId,
          client_event_id: clientEventId,
          occurred_at_ms: occurredAtMs,
          page_path: pagePath,
          page_url: pageUrl,
          user_id: userId,
        },
        attributionForDataLayer,
      );
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          attribution: attributionPayload,
          client_event_id: clientEventId,
          journey_id: journeyId,
          locale,
          pageUrl,
          service: serviceKey,
          user: userId,
        }),
      });

      const responseText = await response.text();
      let responseData = {};
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = {};
      }

      if (!response.ok) {
        const serverMessage =
          typeof responseData.error === 'string' && responseData.error.trim()
            ? responseData.error.trim()
            : '';
        const submitError = new Error(serverMessage || `Request failed with status ${response.status}`);
        submitError.name = `http_${response.status}`;
        throw submitError;
      }

      setSubmitState('success');
      setForm(initialForm);
      pushLeadFormDataLayer(
        'lead_form_submit_success',
        {
          lead_record_id: responseData.lead_record_id ?? null,
          event_class: 'customer_action',
          customer_action: 'form_submit',
          capture_channel: 'form',
          lead_strength: 'captured_lead',
          verification_status: 'unverified',
          locale,
          journey_id: journeyId,
          client_event_id: clientEventId,
          occurred_at_ms: occurredAtMs,
          page_path: pagePath,
          page_url: pageUrl,
          user_id: userId,
        },
        attributionForDataLayer,
      );
    } catch (submitError) {
      setSubmitState('error');
      setErrorMessage(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : copy.errorBody,
      );
      pushLeadFormDataLayer(
        'lead_form_submit_error',
        {
          error_code:
            submitError instanceof Error && submitError.name
              ? submitError.name
              : submitError instanceof Error
                ? 'network_error'
                : 'unknown_error',
          event_class: 'diagnostic',
          customer_action: 'form_submit',
          capture_channel: 'form',
          lead_strength: 'captured_lead',
          verification_status: 'unverified',
          locale,
          journey_id: journeyId,
          client_event_id: clientEventId,
          occurred_at_ms: occurredAtMs,
          page_path: pagePath,
          page_url: pageUrl,
          user_id: userId,
        },
        attributionForDataLayer,
      );
    }
  };

  return (
    <section
      aria-label={showHeader ? undefined : copy.quoteTitle}
      aria-labelledby={showHeader ? 'contact-lead-form-title' : undefined}
      className={`contact-lead-form-section${showHeader ? '' : ' contact-lead-form-section--compact'}`}
    >
      <div className="contact-lead-form-shell">
        {showHeader ? (
          <div className="contact-lead-form-copy">
            <p className="contact-lead-form-kicker">{copy.quoteCta}</p>
            <h2 id="contact-lead-form-title">{copy.quoteTitle}</h2>
            <p className="contact-lead-form-lead">{copy.detailsLabel}</p>
          </div>
        ) : null}

        <form className="contact-lead-form-card" onSubmit={handleSubmit} noValidate>
          <div className="contact-lead-form-grid">
            <label className="contact-lead-form-field">
              <span>{copy.nameLabel}</span>
              <input
                autoComplete="name"
                name="name"
                onChange={onChange}
                required
                type="text"
                value={form.name}
              />
            </label>

            <label className="contact-lead-form-field">
              <span>{copy.emailLabel}</span>
              <input
                autoComplete="email"
                name="email"
                onChange={onChange}
                type="email"
                value={form.email}
              />
            </label>

            <label className="contact-lead-form-field">
              <span>{copy.phoneLabel}</span>
              <input
                autoComplete="tel"
                name="phone"
                onChange={onChange}
                type="tel"
                value={form.phone}
              />
            </label>

            <label className="contact-lead-form-field">
              <span>{copy.vehicleLabel}</span>
              <input
                name="vehicle"
                onChange={onChange}
                type="text"
                value={form.vehicle}
              />
            </label>
          </div>

          <label className="contact-lead-form-field contact-lead-form-field--full">
            <span>{copy.detailsLabel}</span>
            <textarea name="message" onChange={onChange} rows={5} value={form.message} />
          </label>

          <label className="contact-lead-form-honeypot" aria-hidden="true">
            <span>Company</span>
            <input
              autoComplete="off"
              name="company"
              onChange={onChange}
              tabIndex={-1}
              type="text"
              value={form.company}
            />
          </label>

          <div className="contact-lead-form-actions">
            <button disabled={submitState === 'submitting'} type="submit">
              {submitState === 'submitting' ? copy.sendingLabel : copy.submitQuote}
            </button>
          </div>

          {submitState === 'success' ? (
            <p className="contact-lead-form-status contact-lead-form-status--success" role="status">
              <strong>{copy.successTitle}</strong> {copy.successBody}
            </p>
          ) : null}

          {submitState === 'error' ? (
            <p className="contact-lead-form-status contact-lead-form-status--error" role="alert">
              <strong>{copy.errorTitle}</strong> {errorMessage || copy.errorBody}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
