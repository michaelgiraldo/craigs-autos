import type { ChangeEvent, RefObject } from 'react';
import type { QuoteFormCopy } from '../../content/quote-form-copy';
import type { QuoteRequestFormData, QuoteSubmitState } from './types';

type QuoteRequestFormFieldsProps = {
  copy: QuoteFormCopy;
  emailInputRef: RefObject<HTMLInputElement | null>;
  form: QuoteRequestFormData;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  phoneInputRef: RefObject<HTMLInputElement | null>;
  submitState: QuoteSubmitState;
};

export function QuoteRequestFormFields({
  copy,
  emailInputRef,
  form,
  onChange,
  phoneInputRef,
  submitState,
}: QuoteRequestFormFieldsProps) {
  return (
    <>
      <div className="contact-lead-form-grid">
        <label className="contact-lead-form-field">
          <span>{copy.nameLabel}</span>
          <input
            autoComplete="name"
            name="name"
            onChange={onChange}
            placeholder={copy.namePlaceholder}
            required
            type="text"
            value={form.name}
          />
        </label>

        <label className="contact-lead-form-field">
          <span>{copy.phoneLabel}</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            name="phone"
            onChange={onChange}
            placeholder={copy.phonePlaceholder}
            ref={phoneInputRef}
            type="tel"
            value={form.phone}
          />
        </label>

        <label className="contact-lead-form-field">
          <span>{copy.emailLabel}</span>
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            onChange={onChange}
            placeholder={copy.emailPlaceholder}
            ref={emailInputRef}
            type="email"
            value={form.email}
          />
        </label>

        <label className="contact-lead-form-field">
          <span>{copy.vehicleLabel}</span>
          <input
            name="vehicle"
            onChange={onChange}
            placeholder={copy.vehiclePlaceholder}
            type="text"
            value={form.vehicle}
          />
        </label>
      </div>

      <label className="contact-lead-form-field contact-lead-form-field--full">
        <span>{copy.serviceLabel}</span>
        <select name="service" onChange={onChange} value={form.service}>
          <option value="">{copy.servicePlaceholder}</option>
          {copy.serviceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="contact-lead-form-field contact-lead-form-field--full">
        <span>{copy.messageLabel}</span>
        <textarea
          name="message"
          onChange={onChange}
          placeholder={copy.messagePlaceholder}
          rows={5}
          value={form.message}
        />
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
          {submitState === 'submitting' ? copy.submittingLabel : copy.submitLabel}
        </button>
      </div>
    </>
  );
}
