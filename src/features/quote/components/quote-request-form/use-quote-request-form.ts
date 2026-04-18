import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { resolveContactSubmitUrl } from '../../../../lib/backend/public-api-client';
import type { LocaleKey } from '../../../../types/site';
import type { QuoteFormCopy } from '../../content/quote-form-copy';
import { postQuoteRequest } from './api';
import {
  getContactValidityMessages,
  getDefaultService,
  getValidationErrorMessage,
  INITIAL_QUOTE_FORM,
  isQuoteFormSubmittable,
} from './model';
import {
  createQuoteFormTrackingContext,
  pushQuoteSubmitError,
  pushQuoteSubmitSuccess,
} from './tracking';
import type { QuoteRequestFormData, QuoteSubmitState } from './types';

type UseQuoteRequestFormArgs = {
  copy: QuoteFormCopy;
  locale: LocaleKey;
  serviceKey: string;
};

export function useQuoteRequestForm({ copy, locale, serviceKey }: UseQuoteRequestFormArgs) {
  const defaultService = getDefaultService(copy, serviceKey);
  const [form, setForm] = useState<QuoteRequestFormData>(() => ({
    ...INITIAL_QUOTE_FORM,
    service: defaultService,
  }));
  const [submitState, setSubmitState] = useState<QuoteSubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = isQuoteFormSubmittable(form);

  const onChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.currentTarget;
    if (name === 'phone') {
      phoneInputRef.current?.setCustomValidity('');
    }
    if (name === 'email') {
      emailInputRef.current?.setCustomValidity('');
    }
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trackingContext = createQuoteFormTrackingContext(locale);

    if (!canSubmit) {
      const validityMessages = getContactValidityMessages(form, copy);
      phoneInputRef.current?.setCustomValidity(validityMessages.phone);
      emailInputRef.current?.setCustomValidity(validityMessages.email);
      event.currentTarget.reportValidity();
      setSubmitState('error');
      setErrorMessage(getValidationErrorMessage(form, copy));
      pushQuoteSubmitError(trackingContext, 'validation_invalid_input');
      return;
    }

    const endpoint = await resolveContactSubmitUrl();
    if (!endpoint) {
      setSubmitState('error');
      setErrorMessage(copy.validationMissingEndpoint);
      pushQuoteSubmitError(trackingContext, 'missing_endpoint');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const responseData = await postQuoteRequest({
        endpoint,
        form,
        attribution: trackingContext.attributionPayload,
        clientEventId: trackingContext.clientEventId,
        journeyId: trackingContext.journeyId,
        locale,
        pageUrl: trackingContext.pageUrl,
        userId: trackingContext.userId,
      });

      setSubmitState('success');
      setForm({
        ...INITIAL_QUOTE_FORM,
        service: defaultService,
      });
      pushQuoteSubmitSuccess(
        trackingContext,
        typeof responseData.lead_record_id === 'string' ? responseData.lead_record_id : null,
      );
    } catch (submitError) {
      setSubmitState('error');
      setErrorMessage(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : copy.validationFallbackError,
      );
      pushQuoteSubmitError(
        trackingContext,
        submitError instanceof Error && submitError.name
          ? submitError.name
          : submitError instanceof Error
            ? 'network_error'
            : 'unknown_error',
      );
    }
  };

  return {
    canSubmit,
    emailInputRef,
    errorMessage,
    form,
    handleSubmit,
    onChange,
    phoneInputRef,
    submitState,
  };
}
