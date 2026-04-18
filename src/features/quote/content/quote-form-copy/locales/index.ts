import type { QuoteFormLocaleCopyMap } from '../types';
import { quoteFormCopyAr } from './ar';
import { quoteFormCopyEn } from './en';
import { quoteFormCopyEs } from './es';
import { quoteFormCopyFa } from './fa';
import { quoteFormCopyFr } from './fr';
import { quoteFormCopyHi } from './hi';
import { quoteFormCopyId } from './id';
import { quoteFormCopyJa } from './ja';
import { quoteFormCopyKo } from './ko';
import { quoteFormCopyPa } from './pa';
import { quoteFormCopyPtBr } from './pt-br';
import { quoteFormCopyRu } from './ru';
import { quoteFormCopyTa } from './ta';
import { quoteFormCopyTe } from './te';
import { quoteFormCopyTl } from './tl';
import { quoteFormCopyVi } from './vi';
import { quoteFormCopyZhHans } from './zh-hans';
import { quoteFormCopyZhHant } from './zh-hant';

export const QUOTE_FORM_LOCALE_COPY = {
  en: quoteFormCopyEn,
  es: quoteFormCopyEs,
  vi: quoteFormCopyVi,
  'zh-hans': quoteFormCopyZhHans,
  tl: quoteFormCopyTl,
  id: quoteFormCopyId,
  fa: quoteFormCopyFa,
  te: quoteFormCopyTe,
  fr: quoteFormCopyFr,
  ko: quoteFormCopyKo,
  hi: quoteFormCopyHi,
  pa: quoteFormCopyPa,
  'pt-br': quoteFormCopyPtBr,
  'zh-hant': quoteFormCopyZhHant,
  ja: quoteFormCopyJa,
  ar: quoteFormCopyAr,
  ru: quoteFormCopyRu,
  ta: quoteFormCopyTa,
} satisfies QuoteFormLocaleCopyMap;
