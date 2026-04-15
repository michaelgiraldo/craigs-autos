import { CHAT_COPY } from '../../../lib/site-data.js';
import { getPageLabel, resolveLocaleKey } from '../../../lib/site-data/page-registry.js';
import type { LocaleKey } from '../../../types/site';
import { QUOTE_PAGE_COPY } from './quote-page-copy.js';

type QuoteFormCopyOverride = {
	title: string;
	description: string;
	namePlaceholder: string;
	phonePlaceholder: string;
	emailPlaceholder: string;
	vehiclePlaceholder: string;
	serviceLabel: string;
	servicePlaceholder: string;
	messageLabel: string;
	messagePlaceholder: string;
	submitLabel: string;
	submittingLabel: string;
	successTitle: string;
	successBody: string;
	errorTitle: string;
	validationInvalidInput: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	otherServiceLabel: string;
};

export type QuoteFormCopy = {
	kicker: string;
	title: string;
	description: string;
	nameLabel: string;
	namePlaceholder: string;
	phoneLabel: string;
	phonePlaceholder: string;
	emailLabel: string;
	emailPlaceholder: string;
	vehicleLabel: string;
	vehiclePlaceholder: string;
	serviceLabel: string;
	servicePlaceholder: string;
	messageLabel: string;
	messagePlaceholder: string;
	submitLabel: string;
	submittingLabel: string;
	successTitle: string;
	successBody: string;
	errorTitle: string;
	errorBody: string;
	validationInvalidInput: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	serviceOptions: Array<{ value: string; label: string }>;
};

const QUOTE_FORM_COPY_OVERRIDES: Partial<Record<LocaleKey, QuoteFormCopyOverride>> = {
	en: {
		title: 'Tell Us About Your Project',
		description:
			'Share the vehicle, what needs work, and the best phone number to reach you. If you already have photos, mention that in your message and we will follow up.',
		namePlaceholder: 'Your name',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'name@example.com',
		vehiclePlaceholder: 'e.g. 1969 Camaro SS',
		serviceLabel: 'Service needed',
		servicePlaceholder: 'Select a service',
		messageLabel: 'Tell us about your project',
		messagePlaceholder:
			'Describe the condition of your interior, what you want repaired, and anything we should know before we reply.',
		submitLabel: 'Submit quote request',
		submittingLabel: 'Submitting...',
		successTitle: 'Thanks. Your request is in.',
		successBody: 'Victor reviews each quote request manually and will follow up soon.',
		errorTitle: 'We could not send your request.',
		validationInvalidInput: 'Please add your name and a valid phone number.',
		validationMissingEndpoint: 'The quote request form is not configured yet. Please try again soon.',
		validationFallbackError: 'We could not submit your quote request. Please try again or call the shop.',
		otherServiceLabel: 'Other / Not sure yet',
	},
	es: {
		title: 'Cuéntanos sobre tu proyecto',
		description:
			'Comparte el vehículo, lo que necesita reparación y el mejor teléfono para responderte. Si ya tienes fotos, menciónalo en tu mensaje y te contactaremos.',
		namePlaceholder: 'Tu nombre',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nombre@ejemplo.com',
		vehiclePlaceholder: 'ej. Camaro SS 1969',
		serviceLabel: 'Servicio que necesitas',
		servicePlaceholder: 'Selecciona un servicio',
		messageLabel: 'Cuéntanos sobre tu proyecto',
		messagePlaceholder:
			'Describe el estado del interior, qué quieres reparar y cualquier detalle que debamos saber antes de responder.',
		submitLabel: 'Enviar solicitud de cotización',
		submittingLabel: 'Enviando...',
		successTitle: 'Gracias. Tu solicitud ya llegó.',
		successBody: 'Victor revisa cada solicitud manualmente y te responderá pronto.',
		errorTitle: 'No pudimos enviar tu solicitud.',
		validationInvalidInput: 'Agrega tu nombre y un número de teléfono válido.',
		validationMissingEndpoint: 'El formulario de cotización todavía no está configurado. Inténtalo de nuevo pronto.',
		validationFallbackError:
			'No pudimos enviar tu solicitud de cotización. Inténtalo de nuevo o llama al taller.',
		otherServiceLabel: 'Otro / Aún no estoy seguro',
	},
};

const SERVICE_OPTION_KEYS = [
	{ value: 'auto-upholstery', pageKey: 'autoUpholstery' },
	{ value: 'car-seats', pageKey: 'carSeats' },
	{ value: 'headliners', pageKey: 'headliners' },
	{ value: 'convertible-tops', pageKey: 'convertibleTops' },
	{ value: 'classic-cars', pageKey: 'classicCars' },
	{ value: 'commercial-fleet', pageKey: 'commercialFleet' },
	{ value: 'motorcycle-seats', pageKey: 'motorcycleSeats' },
] as const;

export function getQuoteFormCopy(locale: LocaleKey): QuoteFormCopy {
	const resolvedLocale = resolveLocaleKey(locale) as LocaleKey;
	const chatCopy = CHAT_COPY[resolvedLocale] ?? CHAT_COPY.en;
	const quotePageCopy = QUOTE_PAGE_COPY[resolvedLocale] ?? QUOTE_PAGE_COPY.en;
	const override = QUOTE_FORM_COPY_OVERRIDES[resolvedLocale] ?? QUOTE_FORM_COPY_OVERRIDES.en!;

	const serviceOptions: Array<{ value: string; label: string }> = SERVICE_OPTION_KEYS.map(({ value, pageKey }) => ({
		value,
		label: getPageLabel(pageKey, resolvedLocale) ?? getPageLabel(pageKey, 'en') ?? value,
	}));

	serviceOptions.push({
		value: 'other',
		label: override.otherServiceLabel,
	});

	return {
		kicker: chatCopy.quoteCta,
		title: override.title,
		description: override.description || quotePageCopy.lead,
		nameLabel: chatCopy.nameLabel,
		namePlaceholder: override.namePlaceholder,
		phoneLabel: chatCopy.phoneLabel,
		phonePlaceholder: override.phonePlaceholder,
		emailLabel: chatCopy.emailLabel,
		emailPlaceholder: override.emailPlaceholder,
		vehicleLabel: chatCopy.vehicleLabel,
		vehiclePlaceholder: override.vehiclePlaceholder,
		serviceLabel: override.serviceLabel,
		servicePlaceholder: override.servicePlaceholder,
		messageLabel: override.messageLabel,
		messagePlaceholder: override.messagePlaceholder,
		submitLabel: override.submitLabel,
		submittingLabel: override.submittingLabel,
		successTitle: override.successTitle ?? chatCopy.successTitle,
		successBody: override.successBody ?? chatCopy.successBody,
		errorTitle: override.errorTitle ?? chatCopy.errorTitle,
		errorBody: override.validationFallbackError || chatCopy.errorBody,
		validationInvalidInput: override.validationInvalidInput,
		validationMissingEndpoint: override.validationMissingEndpoint,
		validationFallbackError: override.validationFallbackError,
		serviceOptions,
	};
}
