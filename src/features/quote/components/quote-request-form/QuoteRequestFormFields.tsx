import type { ChangeEvent, RefObject } from 'react';
import type { QuoteFormCopy } from '../../content/form';
import type { QuotePhotoDraft, QuoteRequestFormData, QuoteSubmitState } from './types';

type QuoteRequestFormFieldsProps = {
  copy: QuoteFormCopy;
  emailInputRef: RefObject<HTMLInputElement | null>;
  form: QuoteRequestFormData;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (photoId: string) => void;
  onSelectPhotos: () => void;
  phoneInputRef: RefObject<HTMLInputElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  photos: QuotePhotoDraft[];
  submitState: QuoteSubmitState;
};

export function QuoteRequestFormFields({
  copy,
  emailInputRef,
  form,
  onChange,
  onPhotoChange,
  onRemovePhoto,
  onSelectPhotos,
  phoneInputRef,
  photoInputRef,
  photos,
  submitState,
}: QuoteRequestFormFieldsProps) {
  const isSubmitting = submitState === 'submitting';

  return (
    <>
      <div className="quote-request-form-grid">
        <label className="quote-request-form-field">
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

        <label className="quote-request-form-field">
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

        <label className="quote-request-form-field">
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

        <label className="quote-request-form-field">
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

      <label className="quote-request-form-field quote-request-form-field--full">
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

      <label className="quote-request-form-field quote-request-form-field--full">
        <span>{copy.messageLabel}</span>
        <textarea
          name="message"
          onChange={onChange}
          placeholder={copy.messagePlaceholder}
          rows={5}
          value={form.message}
        />
      </label>

      <div className="quote-request-form-field quote-request-form-field--full quote-photo-tray">
        <span>{copy.photosLabel}</span>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="quote-photo-tray__input"
          multiple
          name="photos"
          onChange={onPhotoChange}
          ref={photoInputRef}
          tabIndex={-1}
          type="file"
        />
        <div className="quote-photo-tray__control">
          <button disabled={isSubmitting} onClick={onSelectPhotos} type="button">
            <span aria-hidden="true">+</span>
            {copy.addPhotosLabel}
          </button>
          <p>{copy.photosHelper}</p>
        </div>

        {photos.length ? (
          <ul className="quote-photo-tray__previews" aria-label={copy.photosLabel}>
            {photos.map((photo, index) => (
              <li key={photo.id} className="quote-photo-tray__preview">
                <img alt={`${copy.photosLabel} ${index + 1}`} src={photo.previewUrl} />
                <span title={photo.name}>{photo.name}</span>
                <button
                  aria-label={`${copy.removePhotoLabel}: ${photo.name}`}
                  disabled={isSubmitting}
                  onClick={() => onRemovePhoto(photo.id)}
                  title={copy.removePhotoLabel}
                  type="button"
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="quote-request-form-honeypot" aria-hidden="true">
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

      <div className="quote-request-form-actions">
        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? copy.submittingLabel : copy.submitLabel}
        </button>
      </div>
    </>
  );
}
