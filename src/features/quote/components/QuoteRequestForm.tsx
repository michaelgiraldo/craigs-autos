import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
	getAttributionForDataLayer,
	getAttributionPayload,
	getJourneyId,
	getLeadUserId,
} from '../../../lib/attribution.js';
import { resolveContactSubmitUrl } from '../../../lib/backend/amplify-outputs.ts';
import type { LocaleKey } from '../../../types/site';
import { createClientEventId, pushLeadDataLayerEvent } from '../../lead-tracking/form-events.ts';
import { getQuoteFormCopy } from '../content/quote-form-copy.ts';
import '../../../styles/contact-lead-form.css';

type QuoteRequestFormProps = {
	locale?: LocaleKey;
	serviceKey?: string;
	showHeader?: boolean;
	compact?: boolean;
};

const initialForm = {
	name: '',
	email: '',
	phone: '',
	vehicle: '',
	service: '',
	message: '',
	company: '',
};

function isEmailValid(email: string) {
	return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPhoneValid(phone: string) {
	return phone.trim() === '' || phone.replace(/[^\d]/g, '').length >= 7;
}

export default function QuoteRequestForm({
	locale = 'en',
	serviceKey = 'requestQuote',
	showHeader = true,
	compact = false,
}: QuoteRequestFormProps) {
	const copy = getQuoteFormCopy(locale);
	const defaultService =
		copy.serviceOptions.some((option) => option.value === serviceKey) ? serviceKey : '';
	const [form, setForm] = useState(() => ({
		...initialForm,
		service: defaultService,
	}));
	const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
	const [errorMessage, setErrorMessage] = useState('');
	const phoneInputRef = useRef<HTMLInputElement>(null);
	const emailInputRef = useRef<HTMLInputElement>(null);
	const hasContactMethod = Boolean(form.phone.trim()) || Boolean(form.email.trim());

	const canSubmit =
		Boolean(form.name.trim()) &&
		hasContactMethod &&
		isEmailValid(form.email) &&
		isPhoneValid(form.phone);

	useEffect(() => {
		phoneInputRef.current?.setCustomValidity('');
		emailInputRef.current?.setCustomValidity('');
	}, [form.phone, form.email]);

	const onChange = (
		event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
	) => {
		const { name, value } = event.currentTarget;
		setForm((current) => ({ ...current, [name]: value }));
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
			if (!hasContactMethod) {
				phoneInputRef.current?.setCustomValidity(copy.validationMissingContactMethod);
				emailInputRef.current?.setCustomValidity(copy.validationMissingContactMethod);
			} else {
				if (form.phone.trim() && !isPhoneValid(form.phone)) {
					phoneInputRef.current?.setCustomValidity(copy.validationInvalidPhone);
				}
				if (form.email.trim() && !isEmailValid(form.email)) {
					emailInputRef.current?.setCustomValidity(copy.validationInvalidEmail);
				}
			}
			event.currentTarget.reportValidity();
			setSubmitState('error');
			setErrorMessage(
				!hasContactMethod
					? copy.validationMissingContactMethod
					: form.phone.trim() && !isPhoneValid(form.phone)
						? copy.validationInvalidPhone
						: form.email.trim() && !isEmailValid(form.email)
							? copy.validationInvalidEmail
							: copy.validationInvalidInput,
			);
			pushLeadDataLayerEvent(
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
			setErrorMessage(copy.validationMissingEndpoint);
			pushLeadDataLayerEvent(
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
					service: form.service,
					user: userId,
				}),
			});

			const responseText = await response.text();
			let responseData: Record<string, unknown> = {};
			try {
				responseData = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
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
			setForm({
				...initialForm,
				service: defaultService,
			});
			pushLeadDataLayerEvent(
				'lead_form_submit_success',
				{
					lead_record_id:
						typeof responseData.lead_record_id === 'string' ? responseData.lead_record_id : null,
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
					: copy.validationFallbackError,
			);
			pushLeadDataLayerEvent(
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
			aria-label={showHeader ? undefined : copy.title}
			aria-labelledby={showHeader ? 'contact-lead-form-title' : undefined}
			className={`contact-lead-form-section${!showHeader || compact ? ' contact-lead-form-section--compact' : ''}`}
		>
			<div className="contact-lead-form-shell">
				{showHeader ? (
					<div className="contact-lead-form-copy">
						<p className="contact-lead-form-kicker">{copy.kicker}</p>
						<h2 id="contact-lead-form-title">{copy.title}</h2>
						<p className="contact-lead-form-lead">{copy.description}</p>
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
