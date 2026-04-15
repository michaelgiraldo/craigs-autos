import { CHAT_COPY } from '../../../lib/site-data.js';
import { getPageLabel, resolveLocaleKey } from '../../../lib/site-data/page-registry.js';
import type { LocaleKey } from '../../../types/site';
import { QUOTE_PAGE_COPY } from './quote-page-copy.js';

type QuoteFormCopyOverride = Partial<{
	title: string;
	description: string;
	vehicleLabel: string;
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
	validationMissingContactMethod: string;
	validationInvalidPhone: string;
	validationInvalidEmail: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	otherServiceLabel: string;
}>;

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
	validationMissingContactMethod: string;
	validationInvalidPhone: string;
	validationInvalidEmail: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	serviceOptions: Array<{ value: string; label: string }>;
};

const QUOTE_FORM_COPY_OVERRIDES: Partial<Record<LocaleKey, QuoteFormCopyOverride>> = {
	en: {
		title: 'Tell Us About Your Project',
		description:
			'Tell us what needs repair or upholstery work. If you already have photos, mention that in your message.',
		vehicleLabel: 'Vehicle or item details',
		namePlaceholder: 'Your name',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'name@example.com',
		vehiclePlaceholder: 'e.g. 1969 Camaro SS, motorcycle seat, or boat captain’s chair',
		serviceLabel: 'Service needed',
		servicePlaceholder: 'Select a service',
		messageLabel: 'Tell us about your project',
		messagePlaceholder:
			'Describe what needs repair or upholstery work, the condition, and anything helpful for a quote.',
		submitLabel: 'Submit quote request',
		submittingLabel: 'Submitting...',
		successTitle: 'Thanks. Your request is in.',
		successBody: 'Each quote request is reviewed manually and we will follow up soon.',
		errorTitle: 'We could not send your request.',
		validationInvalidInput: 'Please review the form and try again.',
		validationMissingContactMethod: 'Add a phone number, an email address, or both.',
		validationInvalidPhone: 'Please enter a valid phone number.',
		validationInvalidEmail: 'Please enter a valid email address.',
		validationMissingEndpoint: 'The quote request form is not configured yet. Please try again soon.',
		validationFallbackError: 'We could not submit your quote request. Please try again or call the shop.',
		otherServiceLabel: 'Other / Not sure yet',
	},
	es: {
		title: 'Cuéntanos sobre tu proyecto',
		description:
			'Cuéntanos qué necesita reparación o trabajo de tapicería. Si ya tienes fotos, menciónalo en tu mensaje.',
		vehicleLabel: 'Vehículo o artículo',
		namePlaceholder: 'Tu nombre',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nombre@ejemplo.com',
		vehiclePlaceholder: 'ej. Camaro SS 1969, asiento de moto o silla de lancha',
		serviceLabel: 'Servicio que necesitas',
		servicePlaceholder: 'Selecciona un servicio',
		messageLabel: 'Cuéntanos sobre tu proyecto',
		messagePlaceholder:
			'Describe qué necesita reparación o tapicería, la condición actual y cualquier detalle útil para cotizar.',
		submitLabel: 'Enviar solicitud de cotización',
		submittingLabel: 'Enviando...',
		successTitle: 'Gracias. Tu solicitud ya llegó.',
		successBody: 'Revisamos cada solicitud manualmente y te responderemos pronto.',
		errorTitle: 'No pudimos enviar tu solicitud.',
		validationInvalidInput: 'Revisa el formulario e inténtalo de nuevo.',
		validationMissingContactMethod: 'Agrega un teléfono, un correo electrónico o ambos.',
		validationInvalidPhone: 'Ingresa un número de teléfono válido.',
		validationInvalidEmail: 'Ingresa un correo electrónico válido.',
		validationMissingEndpoint: 'El formulario de cotización todavía no está configurado. Inténtalo de nuevo pronto.',
		validationFallbackError:
			'No pudimos enviar tu solicitud de cotización. Inténtalo de nuevo o llama al taller.',
		otherServiceLabel: 'Otro / Aún no estoy seguro',
	},
	vi: {
		vehicleLabel: 'Chi tiết xe hoặc món đồ',
	},
	'zh-hans': {
		vehicleLabel: '车辆或物件详情',
	},
	tl: {
		vehicleLabel: 'Detalye ng sasakyan o gamit',
	},
	id: {
		vehicleLabel: 'Detail kendaraan atau barang',
	},
	fa: {
		vehicleLabel: 'جزئیات خودرو یا وسیله',
	},
	te: {
		vehicleLabel: 'వాహనం లేదా వస్తువు వివరాలు',
	},
	fr: {
		vehicleLabel: 'Détails du véhicule ou de l’objet',
	},
	ko: {
		vehicleLabel: '차량 또는 물품 정보',
	},
	hi: {
		vehicleLabel: 'वाहन या वस्तु का विवरण',
	},
	pa: {
		vehicleLabel: 'ਵਾਹਨ ਜਾਂ ਚੀਜ਼ ਦੇ ਵੇਰਵੇ',
	},
	'pt-br': {
		vehicleLabel: 'Detalhes do veículo ou item',
	},
	'zh-hant': {
		vehicleLabel: '車輛或物件詳情',
	},
	ja: {
		vehicleLabel: '車両または品目の詳細',
	},
	ar: {
		vehicleLabel: 'تفاصيل السيارة أو القطعة',
	},
	ru: {
		vehicleLabel: 'Данные автомобиля или предмета',
	},
	ta: {
		vehicleLabel: 'வாகனம் அல்லது பொருளின் விவரங்கள்',
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
	const englishOverride = QUOTE_FORM_COPY_OVERRIDES.en!;
	const localeOverride = QUOTE_FORM_COPY_OVERRIDES[resolvedLocale];
	const override = {
		...englishOverride,
		...localeOverride,
	} as Required<QuoteFormCopyOverride>;

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
		title: localeOverride?.title ?? chatCopy.quoteTitle ?? override.title,
		description: localeOverride?.description ?? quotePageCopy.lead ?? override.description,
		nameLabel: chatCopy.nameLabel,
		namePlaceholder: override.namePlaceholder,
		phoneLabel: chatCopy.phoneLabel,
		phonePlaceholder: override.phonePlaceholder,
		emailLabel: chatCopy.emailLabel,
		emailPlaceholder: override.emailPlaceholder,
		vehicleLabel: localeOverride?.vehicleLabel ?? chatCopy.vehicleLabel,
		vehiclePlaceholder: override.vehiclePlaceholder,
		serviceLabel: localeOverride?.serviceLabel ?? override.serviceLabel,
		servicePlaceholder: localeOverride?.servicePlaceholder ?? override.servicePlaceholder,
		messageLabel: localeOverride?.messageLabel ?? chatCopy.detailsLabel ?? override.messageLabel,
		messagePlaceholder: override.messagePlaceholder,
		submitLabel: localeOverride?.submitLabel ?? chatCopy.submitQuote ?? override.submitLabel,
		submittingLabel: localeOverride?.submittingLabel ?? chatCopy.sendingLabel ?? override.submittingLabel,
		successTitle: localeOverride?.successTitle ?? chatCopy.successTitle,
		successBody: override.successBody ?? chatCopy.successBody,
		errorTitle: localeOverride?.errorTitle ?? chatCopy.errorTitle,
		errorBody: override.validationFallbackError || chatCopy.errorBody,
		validationInvalidInput: override.validationInvalidInput,
		validationMissingContactMethod: override.validationMissingContactMethod,
		validationInvalidPhone: override.validationInvalidPhone,
		validationInvalidEmail: override.validationInvalidEmail,
		validationMissingEndpoint: override.validationMissingEndpoint,
		validationFallbackError: override.validationFallbackError,
		serviceOptions,
	};
}
