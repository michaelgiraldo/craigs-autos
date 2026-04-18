import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyAr = {
  title: 'أخبرنا عن مشروعك',
  description:
    'أخبرنا بما يحتاج إلى إصلاح أو تنجيد. إذا كانت لديك صور بالفعل، فاذكر ذلك في رسالتك.',
  vehicleLabel: 'تفاصيل السيارة أو القطعة',
  namePlaceholder: 'اسمك',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'الاسم@مثال.com',
  vehiclePlaceholder: 'مثال: Camaro SS 1969 أو مقعد دراجة نارية أو مقعد قارب',
  serviceLabel: 'الخدمة المطلوبة',
  servicePlaceholder: 'اختر خدمة',
  messageLabel: 'أخبرنا عن مشروعك',
  messagePlaceholder:
    'اشرح ما الذي يحتاج إلى إصلاح أو تنجيد، وما حالته الحالية، وأي تفاصيل تفيد في إعداد عرض السعر.',
  submitLabel: 'إرسال طلب عرض السعر',
  submittingLabel: 'جارٍ الإرسال...',
  successTitle: 'شكرًا لك. لقد استلمنا طلبك.',
  successBody: 'تتم مراجعة كل طلب يدويًا وسنتابع معك قريبًا.',
  errorTitle: 'تعذر إرسال طلبك.',
  validationInvalidInput: 'يرجى مراجعة النموذج والمحاولة مرة أخرى.',
  validationMissingContactMethod: 'أضف رقم هاتف أو بريدًا إلكترونيًا أو كليهما.',
  validationInvalidPhone: 'يرجى إدخال رقم هاتف صالح.',
  validationInvalidEmail: 'يرجى إدخال عنوان بريد إلكتروني صالح.',
  validationMissingEndpoint: 'نموذج عرض السعر غير مُعد بعد. يرجى المحاولة مرة أخرى لاحقًا.',
  validationFallbackError: 'تعذر إرسال طلب عرض السعر. حاول مرة أخرى أو اتصل بالورشة.',
  otherServiceLabel: 'أخرى / لست متأكدًا بعد',
} satisfies QuoteFormLocaleCopy;
