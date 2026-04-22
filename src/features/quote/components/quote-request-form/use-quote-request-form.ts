import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  LEAD_PHOTO_CONTENT_TYPES,
  LEAD_PHOTO_LIMITS,
} from '@craigs/contracts/lead-attachment-contract';
import {
  resolveLeadAttachmentUploadTargetsUrl,
  resolveQuoteRequestSubmitUrl,
} from '../../../../lib/backend/public-api-client';
import type { LocaleKey } from '../../../../types/site';
import type { QuoteFormCopy } from '../../content/form';
import { postQuoteRequest, uploadQuotePhotos } from './api';
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

const ACCEPTED_PHOTO_TYPES = new Set<string>(LEAD_PHOTO_CONTENT_TYPES);
const MAX_PHOTO_DRAFTS = LEAD_PHOTO_LIMITS.maxCount;

function createPhotoDraft(file: File): QuotePhotoDraft {
  const fallbackId = `${file.name}-${file.lastModified}-${Date.now()}-${Math.random()}`;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackId;

  return {
    id,
    file,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
    size: file.size,
    type: file.type,
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
  const unsupportedPhotoCountRef = useRef(0);
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
    unsupportedPhotoCountRef.current = 0;
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
    const files = Array.from(event.currentTarget.files ?? []);
    const selectedFiles = files.filter((file) => ACCEPTED_PHOTO_TYPES.has(file.type));
    unsupportedPhotoCountRef.current += files.length - selectedFiles.length;
    event.currentTarget.value = '';
    if (!selectedFiles.length) return;

    setPhotos((current) => {
      const availableSlots = Math.max(0, MAX_PHOTO_DRAFTS - current.length);
      const acceptedFiles = selectedFiles.slice(0, availableSlots);
      unsupportedPhotoCountRef.current += selectedFiles.length - acceptedFiles.length;
      if (!acceptedFiles.length) return current;
      return [...current, ...acceptedFiles.map(createPhotoDraft)];
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

    const [endpoint, uploadEndpoint] = await Promise.all([
      resolveQuoteRequestSubmitUrl(),
      resolveLeadAttachmentUploadTargetsUrl(),
    ]);
    if (!endpoint) {
      setSubmitState('error');
      setErrorMessage(copy.validationMissingEndpoint);
      pushQuoteSubmitError(trackingContext, 'missing_endpoint');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const uploadedPhotos = await uploadQuotePhotos({
        clientEventId: trackingContext.clientEventId,
        endpoint: uploadEndpoint,
        photos,
        unsupportedPhotoCount: unsupportedPhotoCountRef.current,
      });
      const responseData = await postQuoteRequest({
        endpoint,
        form,
        attachments: uploadedPhotos.attachments,
        attribution: trackingContext.attributionPayload,
        clientEventId: trackingContext.clientEventId,
        journeyId: trackingContext.journeyId,
        locale,
        pageUrl: trackingContext.pageUrl,
        unsupportedAttachmentCount: uploadedPhotos.unsupportedAttachmentCount,
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
