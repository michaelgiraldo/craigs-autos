import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyTl = {
  title: 'Ikuwento ang proyekto mo',
  description:
    'Sabihin sa amin kung ano ang kailangang ayusin o i-upholster. Kung may mga larawan ka na, banggitin iyon sa mensahe.',
  vehicleLabel: 'Detalye ng sasakyan o gamit',
  namePlaceholder: 'Pangalan mo',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'pangalan@halimbawa.com',
  vehiclePlaceholder: 'hal. 1969 Camaro SS, upuan ng motorsiklo, o upuan ng bangka',
  serviceLabel: 'Kailangang serbisyo',
  servicePlaceholder: 'Pumili ng serbisyo',
  messageLabel: 'Ikuwento ang proyekto mo',
  messagePlaceholder:
    'Ilarawan kung ano ang kailangang ayusin o i-upholster, ang kasalukuyang kondisyon, at anumang detalyeng makakatulong sa quote.',
  submitLabel: 'Isumite ang quote request',
  submittingLabel: 'Isinusumite...',
  successTitle: 'Salamat. Natanggap na namin ang request mo.',
  successBody:
    'Bawat request ay mano-manong sinusuri at makikipag-ugnayan kami sa lalong madaling panahon.',
  errorTitle: 'Hindi namin maipadala ang request mo.',
  validationInvalidInput: 'Pakisuri ang form at subukang muli.',
  validationMissingContactMethod: 'Magdagdag ng numero ng telepono, email address, o pareho.',
  validationInvalidPhone: 'Pakilagay ang wastong numero ng telepono.',
  validationInvalidEmail: 'Pakilagay ang wastong email address.',
  validationMissingEndpoint:
    'Hindi pa naka-configure ang quote form. Pakisubukang muli sa lalong madaling panahon.',
  validationFallbackError:
    'Hindi namin maisumite ang quote request mo. Subukang muli o tumawag sa shop.',
  otherServiceLabel: 'Iba pa / Hindi pa sigurado',
} satisfies QuoteFormLocaleCopy;
