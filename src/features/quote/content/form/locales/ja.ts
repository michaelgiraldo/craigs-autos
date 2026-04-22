import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyJa = {
  title: 'ご依頼内容を教えてください',
  description:
    'どの部分に修理や張り替えが必要か教えてください。すでに写真がある場合は、メッセージでそのこともお知らせください。',
  vehicleLabel: '車両または品目の詳細',
  namePlaceholder: 'お名前',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'namae@example.jp',
  vehiclePlaceholder: '例: 1969年式 Camaro SS、バイクシート、ボートシート',
  serviceLabel: '必要なサービス',
  servicePlaceholder: 'サービスを選択してください',
  messageLabel: 'ご依頼内容を教えてください',
  messagePlaceholder:
    'どの部分に修理や張り替えが必要か、現在の状態、見積もりに役立つ詳細をお書きください。',
  submitLabel: '見積もり依頼を送信',
  submittingLabel: '送信中...',
  successTitle: 'ありがとうございます。ご依頼を受け取りました。',
  successBody: 'すべての依頼は手動で確認され、まもなくご連絡します。',
  errorTitle: '依頼を送信できませんでした。',
  validationInvalidInput: 'フォームを確認して、もう一度お試しください。',
  validationMissingContactMethod: '電話番号、メールアドレス、または両方を入力してください。',
  validationInvalidPhone: '有効な電話番号を入力してください。',
  validationInvalidEmail: '有効なメールアドレスを入力してください。',
  validationMissingEndpoint:
    '見積もりフォームはまだ設定されていません。後でもう一度お試しください。',
  validationFallbackError:
    '見積もり依頼を送信できませんでした。もう一度お試しいただくか、店舗までお電話ください。',
  otherServiceLabel: 'その他 / まだわからない',
  photosLabel: '写真',
  photosHelper: '任意です。鮮明な写真があれば数枚追加してください。',
  addPhotosLabel: '写真を追加',
  removePhotoLabel: '写真を削除',
} satisfies QuoteFormLocaleCopy;
