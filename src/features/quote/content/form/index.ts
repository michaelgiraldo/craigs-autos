import { LOCALES } from '../../../../lib/site-data/core.js';
import { CHAT_COPY } from '../../../../lib/site-data.js';
import type { LocaleKey } from '../../../../types/site';
import { QUOTE_FORM_LOCALE_COPY } from './locales';
import { getQuoteServiceOptions } from './service-options';
import type { QuoteFormCopy } from './types';

export type { QuoteFormCopy } from './types';

function resolveLocaleKey(locale: LocaleKey): LocaleKey {
  return (LOCALES[locale] ? locale : 'en') as LocaleKey;
}

export function getQuoteFormCopy(locale: LocaleKey): QuoteFormCopy {
  const resolvedLocale = resolveLocaleKey(locale);
  const chatCopy = CHAT_COPY[resolvedLocale] ?? CHAT_COPY.en;
  const localeCopy = QUOTE_FORM_LOCALE_COPY[resolvedLocale] ?? QUOTE_FORM_LOCALE_COPY.en;
  const serviceOptions = getQuoteServiceOptions(resolvedLocale, localeCopy.otherServiceLabel);

  return {
    kicker: chatCopy.quoteCta,
    title: localeCopy.title,
    description: localeCopy.description,
    nameLabel: chatCopy.nameLabel,
    namePlaceholder: localeCopy.namePlaceholder,
    phoneLabel: chatCopy.phoneLabel,
    phonePlaceholder: localeCopy.phonePlaceholder,
    emailLabel: chatCopy.emailLabel,
    emailPlaceholder: localeCopy.emailPlaceholder,
    vehicleLabel: localeCopy.vehicleLabel,
    vehiclePlaceholder: localeCopy.vehiclePlaceholder,
    serviceLabel: localeCopy.serviceLabel,
    servicePlaceholder: localeCopy.servicePlaceholder,
    messageLabel: localeCopy.messageLabel,
    messagePlaceholder: localeCopy.messagePlaceholder,
    submitLabel: localeCopy.submitLabel,
    submittingLabel: localeCopy.submittingLabel,
    successTitle: localeCopy.successTitle,
    successBody: localeCopy.successBody,
    errorTitle: localeCopy.errorTitle,
    errorBody: localeCopy.validationFallbackError,
    validationInvalidInput: localeCopy.validationInvalidInput,
    validationMissingContactMethod: localeCopy.validationMissingContactMethod,
    validationInvalidPhone: localeCopy.validationInvalidPhone,
    validationInvalidEmail: localeCopy.validationInvalidEmail,
    validationMissingEndpoint: localeCopy.validationMissingEndpoint,
    validationFallbackError: localeCopy.validationFallbackError,
    photosLabel: localeCopy.photosLabel,
    photosHelper: localeCopy.photosHelper,
    addPhotosLabel: localeCopy.addPhotosLabel,
    removePhotoLabel: localeCopy.removePhotoLabel,
    serviceOptions,
  };
}
