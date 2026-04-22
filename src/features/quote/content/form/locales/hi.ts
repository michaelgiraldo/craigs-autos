import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyHi = {
  title: 'अपने प्रोजेक्ट के बारे में बताइए',
  description:
    'हमें बताइए किस चीज़ को मरम्मत या अपहोल्स्ट्री काम की ज़रूरत है। अगर आपके पास पहले से फोटो हैं, तो उसे अपने संदेश में लिखें।',
  vehicleLabel: 'वाहन या वस्तु का विवरण',
  namePlaceholder: 'आपका नाम',
  phonePlaceholder: '(408) 555-1234',
  emailPlaceholder: 'नाम@उदाहरण.in',
  vehiclePlaceholder: 'उदा. 1969 Camaro SS, मोटरसाइकिल सीट, या नाव की सीट',
  serviceLabel: 'आवश्यक सेवा',
  servicePlaceholder: 'एक सेवा चुनें',
  messageLabel: 'अपने प्रोजेक्ट के बारे में बताइए',
  messagePlaceholder:
    'क्या मरम्मत या अपहोल्स्ट्री काम चाहिए, उसकी वर्तमान स्थिति क्या है, और कोट के लिए कौन-सी जानकारी उपयोगी होगी, यह बताइए।',
  submitLabel: 'कोट अनुरोध भेजें',
  submittingLabel: 'भेजा जा रहा है...',
  successTitle: 'धन्यवाद। आपका अनुरोध हमें मिल गया है।',
  successBody: 'हर अनुरोध को मैन्युअल रूप से देखा जाता है और हम जल्द ही आपसे संपर्क करेंगे।',
  errorTitle: 'हम आपका अनुरोध भेज नहीं सके।',
  validationInvalidInput: 'कृपया फ़ॉर्म की जाँच करें और फिर से कोशिश करें।',
  validationMissingContactMethod: 'फ़ोन नंबर, ईमेल पता, या दोनों जोड़ें।',
  validationInvalidPhone: 'कृपया मान्य फ़ोन नंबर दर्ज करें।',
  validationInvalidEmail: 'कृपया मान्य ईमेल पता दर्ज करें।',
  validationMissingEndpoint: 'कोट फ़ॉर्म अभी कॉन्फ़िगर नहीं हुआ है। कृपया बाद में फिर कोशिश करें।',
  validationFallbackError: 'हम आपका कोट अनुरोध जमा नहीं कर सके। कृपया फिर कोशिश करें या दुकान पर कॉल करें।',
  otherServiceLabel: 'अन्य / अभी निश्चित नहीं',
  photosLabel: 'फ़ोटो',
  photosHelper: 'वैकल्पिक। अगर आपके पास कुछ साफ़ फ़ोटो हैं, तो जोड़ें।',
  addPhotosLabel: 'फ़ोटो जोड़ें',
  removePhotoLabel: 'फ़ोटो हटाएँ',
} satisfies QuoteFormLocaleCopy;
