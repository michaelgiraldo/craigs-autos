import { getQuoteFormCopy } from '../content/quote-form-copy.ts';
import { QuoteRequestFormFields } from './quote-request-form/QuoteRequestFormFields.tsx';
import { QuoteRequestFormStatus } from './quote-request-form/QuoteRequestFormStatus.tsx';
import type { QuoteRequestFormProps } from './quote-request-form/types.ts';
import { useQuoteRequestForm } from './quote-request-form/use-quote-request-form.ts';
import '../../../styles/contact-lead-form.css';

export default function QuoteRequestForm({
  locale = 'en',
  serviceKey = 'requestQuote',
  showHeader = true,
  compact = false,
}: QuoteRequestFormProps) {
  const copy = getQuoteFormCopy(locale);
  const { emailInputRef, errorMessage, form, handleSubmit, onChange, phoneInputRef, submitState } =
    useQuoteRequestForm({ copy, locale, serviceKey });

  return (
    <section
      aria-label={showHeader ? undefined : copy.title}
      aria-labelledby={showHeader ? 'contact-lead-form-title' : undefined}
      className={`contact-lead-form-section${!showHeader || compact ? ' contact-lead-form-section--compact' : ''}`}
    >
      <div className="contact-lead-form-shell">
        {showHeader ? (
          <div className="contact-lead-form-copy">
            <p className="contact-lead-form-kicker">{copy.kicker}</p>
            <h2 id="contact-lead-form-title">{copy.title}</h2>
            <p className="contact-lead-form-lead">{copy.description}</p>
          </div>
        ) : null}

        <form className="contact-lead-form-card" method="post" onSubmit={handleSubmit} noValidate>
          <QuoteRequestFormFields
            copy={copy}
            emailInputRef={emailInputRef}
            form={form}
            onChange={onChange}
            phoneInputRef={phoneInputRef}
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
