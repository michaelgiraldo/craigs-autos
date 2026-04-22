import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyFr = {
  title: 'Parlez-nous de votre projet',
  description:
    'Dites-nous ce qui a besoin d’une réparation ou d’un travail de garnissage. Si vous avez déjà des photos, mentionnez-le dans votre message.',
  vehicleLabel: 'Détails du véhicule ou de l’objet',
  namePlaceholder: 'Votre nom',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'nom@exemple.fr',
  vehiclePlaceholder: 'ex. Camaro SS 1969, selle de moto ou siège de bateau',
  serviceLabel: 'Service demandé',
  servicePlaceholder: 'Sélectionnez un service',
  messageLabel: 'Parlez-nous de votre projet',
  messagePlaceholder:
    'Décrivez ce qui doit être réparé ou regarni, l’état actuel et tout détail utile pour établir un devis.',
  submitLabel: 'Envoyer la demande de devis',
  submittingLabel: 'Envoi en cours...',
  successTitle: 'Merci. Votre demande a bien été reçue.',
  successBody: 'Chaque demande est examinée manuellement et nous reviendrons vers vous rapidement.',
  errorTitle: 'Nous n’avons pas pu envoyer votre demande.',
  validationInvalidInput: 'Veuillez vérifier le formulaire et réessayer.',
  validationMissingContactMethod: 'Ajoutez un numéro de téléphone, une adresse email, ou les deux.',
  validationInvalidPhone: 'Veuillez saisir un numéro de téléphone valide.',
  validationInvalidEmail: 'Veuillez saisir une adresse email valide.',
  validationMissingEndpoint:
    'Le formulaire de devis n’est pas encore configuré. Veuillez réessayer plus tard.',
  validationFallbackError:
    'Nous n’avons pas pu envoyer votre demande de devis. Réessayez ou appelez l’atelier.',
  otherServiceLabel: 'Autre / Pas encore sûr',
  photosLabel: 'Photos',
  photosHelper: 'Facultatif. Ajoutez quelques photos nettes si vous en avez.',
  addPhotosLabel: 'Ajouter des photos',
  removePhotoLabel: 'Supprimer la photo',
} satisfies QuoteFormLocaleCopy;
