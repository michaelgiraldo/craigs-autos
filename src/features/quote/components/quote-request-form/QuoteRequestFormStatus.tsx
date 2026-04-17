import type { QuoteFormCopy } from '../../content/quote-form-copy';
import type { QuoteSubmitState } from './types';

type QuoteRequestFormStatusProps = {
  copy: QuoteFormCopy;
  errorMessage: string;
  submitState: QuoteSubmitState;
};

export function QuoteRequestFormStatus({
  copy,
  errorMessage,
  submitState,
}: QuoteRequestFormStatusProps) {
  if (submitState === 'success') {
    return (
      <p className="contact-lead-form-status contact-lead-form-status--success" role="status">
        <strong>{copy.successTitle}</strong> {copy.successBody}
      </p>
    );
  }

  if (submitState === 'error') {
    return (
      <p className="contact-lead-form-status contact-lead-form-status--error" role="alert">
        <strong>{copy.errorTitle}</strong> {errorMessage || copy.errorBody}
      </p>
    );
  }

  return null;
}
