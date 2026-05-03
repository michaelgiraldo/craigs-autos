const PUBLIC_CONVERSATION_EMAIL = 'contact@craigs.autos';
const INTERNAL_LEAD_INBOX_EMAIL = 'leads@craigs.autos';
const HUMAN_OPERATOR_EMAIL = 'victor@craigs.autos';
const SYSTEM_SENDER_EMAIL = 'system@craigs.autos';
const ALERT_GROUP_EMAIL = 'alerts@craigs.autos';
const EMAIL_INTAKE_RECIPIENT = 'contact-intake@email-intake.craigs.autos';

export const CRAIGS_BUSINESS_PROFILE = Object.freeze({
  id: 'craigs-auto-upholstery',
  name: "Craig's Auto Upholstery",
  siteLabel: 'craigs.autos',
  timezone: 'America/Los_Angeles',
  domains: Object.freeze({
    canonicalUrl: 'https://craigs.autos',
  }),
  phone: Object.freeze({
    e164: '+14083793820',
    display: '(408) 379-3820',
    digits: '4083793820',
  }),
  email: Object.freeze({
    publicContact: PUBLIC_CONVERSATION_EMAIL,
    publicConversation: PUBLIC_CONVERSATION_EMAIL,
    emailIntakeRecipient: EMAIL_INTAKE_RECIPIENT,
    emailIntakeRouteHeader: 'contact-public-intake',
    internalLeadInbox: INTERNAL_LEAD_INBOX_EMAIL,
    humanOperator: HUMAN_OPERATOR_EMAIL,
    systemSender: SYSTEM_SENDER_EMAIL,
    alertGroup: ALERT_GROUP_EMAIL,
    customerOutboundFrom: PUBLIC_CONVERSATION_EMAIL,
    customerOutboundReplyTo: PUBLIC_CONVERSATION_EMAIL,
    customerOutboundBcc: INTERNAL_LEAD_INBOX_EMAIL,
    leadNotificationTo: INTERNAL_LEAD_INBOX_EMAIL,
    leadNotificationFrom: INTERNAL_LEAD_INBOX_EMAIL,
    leadTo: INTERNAL_LEAD_INBOX_EMAIL,
    leadFrom: INTERNAL_LEAD_INBOX_EMAIL,
    emailCustomerFrom: PUBLIC_CONVERSATION_EMAIL,
    emailCustomerReplyTo: PUBLIC_CONVERSATION_EMAIL,
    quoteCustomerFrom: PUBLIC_CONVERSATION_EMAIL,
    quoteCustomerBcc: INTERNAL_LEAD_INBOX_EMAIL,
    quoteCustomerReplyTo: PUBLIC_CONVERSATION_EMAIL,
  }),
  address: Object.freeze({
    street: '271 Bestor St',
    city: 'San Jose',
    region: 'CA',
    postalCode: '95112',
    country: 'US',
    formatted: '271 Bestor St, San Jose, CA 95112',
  }),
  maps: Object.freeze({
    appleUrl:
      'https://maps.apple.com/place?place-id=I5191F0670292696E&address=271+Bestor+St%2C+San+Jose%2C+CA++95112%2C+United+States&coordinate=37.3241991%2C-121.8734233&name=Craig%27s+Auto+Upholstery&_provider=9902',
  }),
  geo: Object.freeze({
    latitude: 37.3241016,
    longitude: -121.8734335,
  }),
  hours: Object.freeze([
    Object.freeze({
      days: Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      opens: '08:00',
      closes: '17:00',
    }),
    Object.freeze({ days: Object.freeze(['Saturday']), opens: '08:00', closes: '14:00' }),
  ]),
  sameAs: Object.freeze([
    'https://www.yelp.com/biz/craigs-auto-upholstery-san-jose',
    'https://share.google/7YeUZX7fufHdKULQN',
  ]),
  quo: Object.freeze({
    contactSource: 'craigs-auto-upholstery-web',
    contactExternalIdPrefix: 'craigs-auto-upholstery',
    leadTagsFieldName: 'Lead Tags',
  }),
});

export const CRAIGS_LEAD_ENV_DEFAULTS = Object.freeze({
  CONTACT_SITE_LABEL: CRAIGS_BUSINESS_PROFILE.siteLabel,
  LEAD_TO_EMAIL: CRAIGS_BUSINESS_PROFILE.email.leadNotificationTo,
  LEAD_FROM_EMAIL: CRAIGS_BUSINESS_PROFILE.email.leadNotificationFrom,
  CONTACT_TO_EMAIL: CRAIGS_BUSINESS_PROFILE.email.leadNotificationTo,
  CONTACT_FROM_EMAIL: CRAIGS_BUSINESS_PROFILE.email.leadNotificationFrom,
  EMAIL_INTAKE_RECIPIENT: CRAIGS_BUSINESS_PROFILE.email.emailIntakeRecipient,
  EMAIL_INTAKE_ORIGINAL_RECIPIENT: CRAIGS_BUSINESS_PROFILE.email.publicContact,
  EMAIL_INTAKE_GOOGLE_ROUTE_HEADER: CRAIGS_BUSINESS_PROFILE.email.emailIntakeRouteHeader,
  EMAIL_CUSTOMER_FROM_EMAIL: CRAIGS_BUSINESS_PROFILE.email.customerOutboundFrom,
  EMAIL_CUSTOMER_REPLY_TO_EMAIL: CRAIGS_BUSINESS_PROFILE.email.customerOutboundReplyTo,
  QUOTE_CUSTOMER_FROM_EMAIL: CRAIGS_BUSINESS_PROFILE.email.customerOutboundFrom,
  QUOTE_CUSTOMER_BCC_EMAIL: CRAIGS_BUSINESS_PROFILE.email.customerOutboundBcc,
  QUOTE_CUSTOMER_REPLY_TO_EMAIL: CRAIGS_BUSINESS_PROFILE.email.customerOutboundReplyTo,
  LEAD_FAILURE_ALERT_FROM_EMAIL: CRAIGS_BUSINESS_PROFILE.email.systemSender,
  LEAD_FAILURE_ALERT_EMAILS: CRAIGS_BUSINESS_PROFILE.email.alertGroup,
  LEAD_FAILURE_ALERT_BATCH_SIZE: '25',
  LEAD_FAILURE_ALERT_MIN_INTERVAL_SECONDS: '3600',
  SHOP_NAME: CRAIGS_BUSINESS_PROFILE.name,
  SHOP_PHONE_DISPLAY: CRAIGS_BUSINESS_PROFILE.phone.display,
  SHOP_PHONE_DIGITS: CRAIGS_BUSINESS_PROFILE.phone.digits,
  SHOP_ADDRESS: CRAIGS_BUSINESS_PROFILE.address.formatted,
  QUO_CONTACT_SOURCE: CRAIGS_BUSINESS_PROFILE.quo.contactSource,
  QUO_CONTACT_EXTERNAL_ID_PREFIX: CRAIGS_BUSINESS_PROFILE.quo.contactExternalIdPrefix,
  QUO_LEAD_TAGS_FIELD_NAME: CRAIGS_BUSINESS_PROFILE.quo.leadTagsFieldName,
});

export function formatBusinessAddress(profile = CRAIGS_BUSINESS_PROFILE) {
  return profile.address.formatted;
}

export function buildSmsSignature(args) {
  return [args.shopName, args.shopPhoneDisplay].filter(Boolean).join('\n');
}

export function buildEmailSignature(args) {
  return [args.shopName, args.shopPhoneDisplay, args.shopAddress].filter(Boolean).join('\n');
}
