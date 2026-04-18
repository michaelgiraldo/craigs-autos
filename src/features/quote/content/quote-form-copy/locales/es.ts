import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyEs = {
  title: 'Cuéntanos sobre tu proyecto',
  description:
    'Cuéntanos qué necesita reparación o trabajo de tapicería. Si ya tienes fotos, menciónalo en tu mensaje.',
  vehicleLabel: 'Vehículo o artículo',
  namePlaceholder: 'Tu nombre',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'nombre@ejemplo.com',
  vehiclePlaceholder: 'ej. Camaro SS 1969, asiento de moto o silla de lancha',
  serviceLabel: 'Servicio que necesitas',
  servicePlaceholder: 'Selecciona un servicio',
  messageLabel: 'Cuéntanos sobre tu proyecto',
  messagePlaceholder:
    'Describe qué necesita reparación o tapicería, la condición actual y cualquier detalle útil para cotizar.',
  submitLabel: 'Enviar solicitud de cotización',
  submittingLabel: 'Enviando...',
  successTitle: 'Gracias. Tu solicitud ya llegó.',
  successBody: 'Revisamos cada solicitud manualmente y te responderemos pronto.',
  errorTitle: 'No pudimos enviar tu solicitud.',
  validationInvalidInput: 'Revisa el formulario e inténtalo de nuevo.',
  validationMissingContactMethod: 'Agrega un teléfono, un correo electrónico o ambos.',
  validationInvalidPhone: 'Ingresa un número de teléfono válido.',
  validationInvalidEmail: 'Ingresa un correo electrónico válido.',
  validationMissingEndpoint:
    'El formulario de cotización todavía no está configurado. Inténtalo de nuevo pronto.',
  validationFallbackError:
    'No pudimos enviar tu solicitud de cotización. Inténtalo de nuevo o llama al taller.',
  otherServiceLabel: 'Otro / Aún no estoy seguro',
} satisfies QuoteFormLocaleCopy;
