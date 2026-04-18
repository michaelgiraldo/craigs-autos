import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyRu = {
  title: 'Расскажите о вашем проекте',
  description:
    'Расскажите, что нужно отремонтировать или перетянуть. Если у вас уже есть фото, укажите это в сообщении.',
  vehicleLabel: 'Данные автомобиля или предмета',
  namePlaceholder: 'Ваше имя',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'имя@пример.ru',
  vehiclePlaceholder: 'например: Camaro SS 1969 года, сиденье мотоцикла или кресло катера',
  serviceLabel: 'Нужная услуга',
  servicePlaceholder: 'Выберите услугу',
  messageLabel: 'Расскажите о вашем проекте',
  messagePlaceholder:
    'Опишите, что нужно отремонтировать или перетянуть, текущее состояние и любые детали, полезные для оценки.',
  submitLabel: 'Отправить запрос на оценку',
  submittingLabel: 'Отправка...',
  successTitle: 'Спасибо. Мы получили ваш запрос.',
  successBody: 'Каждый запрос проверяется вручную, и мы скоро свяжемся с вами.',
  errorTitle: 'Мы не смогли отправить ваш запрос.',
  validationInvalidInput: 'Проверьте форму и попробуйте снова.',
  validationMissingContactMethod: 'Добавьте номер телефона, email или оба варианта.',
  validationInvalidPhone: 'Введите корректный номер телефона.',
  validationInvalidEmail: 'Введите корректный адрес email.',
  validationMissingEndpoint: 'Форма оценки еще не настроена. Попробуйте позже.',
  validationFallbackError:
    'Мы не смогли отправить ваш запрос на оценку. Попробуйте снова или позвоните в мастерскую.',
  otherServiceLabel: 'Другое / Пока не уверен',
} satisfies QuoteFormLocaleCopy;
