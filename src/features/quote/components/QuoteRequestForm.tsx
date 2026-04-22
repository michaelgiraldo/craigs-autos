import { getQuoteFormCopy } from '../content/form';
import { QuoteRequestFormFields } from './quote-request-form/QuoteRequestFormFields.tsx';
import { QuoteRequestFormStatus } from './quote-request-form/QuoteRequestFormStatus.tsx';
import type { QuoteRequestFormProps } from './quote-request-form/types.ts';
import { useQuoteRequestForm } from './quote-request-form/use-quote-request-form.ts';
import '../../../styles/quote-request-form.css';

export default function QuoteRequestForm({
  locale = 'en',
  serviceKey = 'requestQuote',
  showHeader = true,
  compact = false,
}: QuoteRequestFormProps) {
  const copy = getQuoteFormCopy(locale);
  const {
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
  } = useQuoteRequestForm({ copy, locale, serviceKey });

  return (
    <section
      aria-label={showHeader ? undefined : copy.title}
      aria-labelledby={showHeader ? 'quote-request-form-title' : undefined}
      className={`quote-request-form-section${!showHeader || compact ? ' quote-request-form-section--compact' : ''}`}
    >
      <div className="quote-request-form-shell">
        {showHeader ? (
          <div className="quote-request-form-copy">
            <p className="quote-request-form-kicker">{copy.kicker}</p>
            <h2 id="quote-request-form-title">{copy.title}</h2>
            <p className="quote-request-form-lead">{copy.description}</p>
          </div>
        ) : null}

        <form className="quote-request-form-card" method="post" onSubmit={handleSubmit} noValidate>
          <QuoteRequestFormFields
            copy={copy}
            emailInputRef={emailInputRef}
            form={form}
            onChange={onChange}
            onPhotoChange={onPhotoChange}
            onRemovePhoto={onRemovePhoto}
            onSelectPhotos={onSelectPhotos}
            phoneInputRef={phoneInputRef}
            photoInputRef={photoInputRef}
            photos={photos}
            submitState={submitState}
          />
          <QuoteRequestFormStatus
            copy={copy}
            errorMessage={errorMessage}
            submitState={submitState}
          />
        </form>
      </div>
    </section>
  );
}
