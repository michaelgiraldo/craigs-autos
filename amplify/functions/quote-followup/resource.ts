import { defineFunction, secret } from '@aws-amplify/backend';

export const quoteFollowup = defineFunction({
  name: 'quote-followup',
  runtime: 24,
  timeoutSeconds: 30,
  environment: {
    CHATKIT_OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    QUO_ENABLED: 'false',
    QUO_FROM_PHONE_NUMBER_ID: '',
    QUO_USER_ID: '',
    QUO_CONTACT_SOURCE: 'craigs-auto-upholstery-web',
    QUO_CONTACT_EXTERNAL_ID_PREFIX: 'craigs-auto-upholstery',
    QUO_LEAD_TAGS_FIELD_KEY: '',
    QUOTE_OUTREACH_MODEL: 'gpt-5.2-2025-12-11',
    CONTACT_FROM_EMAIL: 'leads@craigs.autos',
    CONTACT_TO_EMAIL: 'leads@craigs.autos',
    CONTACT_SITE_LABEL: 'craigs.autos',
    QUOTE_CUSTOMER_FROM_EMAIL: 'leads@craigs.autos',
    QUOTE_CUSTOMER_BCC_EMAIL: 'leads@craigs.autos',
    QUOTE_CUSTOMER_REPLY_TO_EMAIL: 'contact@craigs.autos',
    SHOP_NAME: "Craig's Auto Upholstery",
    SHOP_PHONE_DISPLAY: '(408) 379-3820',
    SHOP_PHONE_DIGITS: '4083793820',
    SHOP_ADDRESS: '271 Bestor St, San Jose, CA 95112',
  },
});
