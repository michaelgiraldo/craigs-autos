import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyEn = {
  title: 'Tell Us About Your Project',
  description:
    'Tell us what needs repair or upholstery work. If you already have photos, mention that in your message.',
  vehicleLabel: 'Vehicle or item details',
  namePlaceholder: 'Your name',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'name@example.com',
  vehiclePlaceholder: 'e.g. 1969 Camaro SS, motorcycle seat, or boat captain’s chair',
  serviceLabel: 'Service needed',
  servicePlaceholder: 'Select a service',
  messageLabel: 'Tell us about your project',
  messagePlaceholder:
    'Describe what needs repair or upholstery work, the condition, and anything helpful for a quote.',
  submitLabel: 'Submit quote request',
  submittingLabel: 'Submitting...',
  successTitle: 'Thanks. Your request is in.',
  successBody: 'Each quote request is reviewed manually and we will follow up soon.',
  errorTitle: 'We could not send your request.',
  validationInvalidInput: 'Please review the form and try again.',
  validationMissingContactMethod: 'Add a phone number, an email address, or both.',
  validationInvalidPhone: 'Please enter a valid phone number.',
  validationInvalidEmail: 'Please enter a valid email address.',
  validationMissingEndpoint: 'The quote request form is not configured yet. Please try again soon.',
  validationFallbackError:
    'We could not submit your quote request. Please try again or call the shop.',
  otherServiceLabel: 'Other / Not sure yet',
  photosLabel: 'Photos',
  photosHelper: 'Optional. Add a few clear photos if you have them.',
  addPhotosLabel: 'Add photos',
  removePhotoLabel: 'Remove photo',
} satisfies QuoteFormLocaleCopy;
