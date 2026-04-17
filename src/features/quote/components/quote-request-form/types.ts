import type { LocaleKey } from '../../../../types/site';

export type QuoteRequestFormProps = {
  locale?: LocaleKey;
  serviceKey?: string;
  showHeader?: boolean;
  compact?: boolean;
};

export type QuoteRequestFormData = {
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  service: string;
  message: string;
  company: string;
};

export type QuoteSubmitState = 'idle' | 'submitting' | 'success' | 'error';
