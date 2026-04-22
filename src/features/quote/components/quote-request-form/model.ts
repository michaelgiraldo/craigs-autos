import type { QuoteFormCopy } from '../../content/form';
import type { QuoteRequestFormData } from './types';

export const INITIAL_QUOTE_FORM: QuoteRequestFormData = {
  name: '',
  email: '',
  phone: '',
  vehicle: '',
  service: '',
  message: '',
  company: '',
};

export function getDefaultService(copy: QuoteFormCopy, serviceKey: string) {
  return copy.serviceOptions.some((option) => option.value === serviceKey) ? serviceKey : '';
}

export function isEmailValid(email: string) {
  return email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isPhoneValid(phone: string) {
  return phone.trim() === '' || phone.replace(/[^\d]/g, '').length >= 7;
}

export function hasContactMethod(form: QuoteRequestFormData) {
  return Boolean(form.phone.trim()) || Boolean(form.email.trim());
}

export function isQuoteFormSubmittable(form: QuoteRequestFormData) {
  return (
    Boolean(form.name.trim()) &&
    hasContactMethod(form) &&
    isEmailValid(form.email) &&
    isPhoneValid(form.phone)
  );
}

export function getContactValidityMessages(form: QuoteRequestFormData, copy: QuoteFormCopy) {
  if (!hasContactMethod(form)) {
    return {
      phone: copy.validationMissingContactMethod,
      email: copy.validationMissingContactMethod,
    };
  }

  return {
    phone: form.phone.trim() && !isPhoneValid(form.phone) ? copy.validationInvalidPhone : '',
    email: form.email.trim() && !isEmailValid(form.email) ? copy.validationInvalidEmail : '',
  };
}

export function getValidationErrorMessage(form: QuoteRequestFormData, copy: QuoteFormCopy) {
  if (!hasContactMethod(form)) {
    return copy.validationMissingContactMethod;
  }
  if (form.phone.trim() && !isPhoneValid(form.phone)) {
    return copy.validationInvalidPhone;
  }
  if (form.email.trim() && !isEmailValid(form.email)) {
    return copy.validationInvalidEmail;
  }
  return copy.validationInvalidInput;
}
