import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { resolveQuoteRequestSubmitUrl } from '../../../../lib/backend/public-api-client';
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
import type { QuotePhotoDraft, QuoteRequestFormData, QuoteSubmitState } from './types';

type UseQuoteRequestFormArgs = {
  copy: QuoteFormCopy;
  locale: LocaleKey;
  serviceKey: string;
};

const ACCEPTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_DRAFTS = 6;

function createPhotoDraft(file: File): QuotePhotoDraft {
  const fallbackId = `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackId;

  return {
    id,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
  };
}

function revokePhotoDraft(photo: QuotePhotoDraft) {
  URL.revokeObjectURL(photo.previewUrl);
}

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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoDraftsRef = useRef<QuotePhotoDraft[]>([]);
  const [photos, setPhotos] = useState<QuotePhotoDraft[]>([]);
  const canSubmit = isQuoteFormSubmittable(form);

  useEffect(() => {
    photoDraftsRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      for (const photo of photoDraftsRef.current) {
        revokePhotoDraft(photo);
      }
      photoDraftsRef.current = [];
    },
    [],
  );

  const clearPhotoDrafts = () => {
    setPhotos((current) => {
      for (const photo of current) {
        revokePhotoDraft(photo);
      }
      return [];
    });
  };

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

  const onPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []).filter((file) =>
      ACCEPTED_PHOTO_TYPES.has(file.type),
    );
    event.currentTarget.value = '';
    if (!selectedFiles.length) return;

    setPhotos((current) => {
      const availableSlots = Math.max(0, MAX_PHOTO_DRAFTS - current.length);
      if (!availableSlots) return current;
      return [...current, ...selectedFiles.slice(0, availableSlots).map(createPhotoDraft)];
    });
  };

  const onSelectPhotos = () => {
    photoInputRef.current?.click();
  };

  const onRemovePhoto = (photoId: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) revokePhotoDraft(removed);
      return current.filter((photo) => photo.id !== photoId);
    });
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

    const endpoint = await resolveQuoteRequestSubmitUrl();
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
      clearPhotoDrafts();
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
    onPhotoChange,
    onRemovePhoto,
    onSelectPhotos,
    phoneInputRef,
    photoInputRef,
    photos,
    submitState,
  };
}
