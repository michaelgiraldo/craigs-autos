import type { QuoteFormCopy } from '../../content/form';
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
      <p className="quote-request-form-status quote-request-form-status--success" role="status">
        <strong>{copy.successTitle}</strong> {copy.successBody}
      </p>
    );
  }

  if (submitState === 'error') {
    return (
      <p className="quote-request-form-status quote-request-form-status--error" role="alert">
        <strong>{copy.errorTitle}</strong> {errorMessage || copy.errorBody}
      </p>
    );
  }

  return null;
}
