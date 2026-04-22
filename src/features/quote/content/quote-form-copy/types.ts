import type { LocaleKey } from '../../../../types/site';

export type QuoteFormLocaleCopy = {
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
  photosLabel?: string;
  photosHelper?: string;
  addPhotosLabel?: string;
  removePhotoLabel?: string;
};

export type QuoteServiceOption = {
  value: string;
  label: string;
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
  validationMissingContactMethod: string;
  validationInvalidPhone: string;
  validationInvalidEmail: string;
  validationMissingEndpoint: string;
  validationFallbackError: string;
  serviceOptions: QuoteServiceOption[];
  photosLabel: string;
  photosHelper: string;
  addPhotosLabel: string;
  removePhotoLabel: string;
};

export type QuoteFormLocaleCopyMap = Record<LocaleKey, QuoteFormLocaleCopy>;
