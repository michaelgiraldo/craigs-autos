export type BusinessProfile = {
  readonly id: string;
  readonly name: string;
  readonly siteLabel: string;
  readonly timezone: string;
  readonly domains: {
    readonly canonicalUrl: string;
    readonly chatUrl: string;
  };
  readonly phone: {
    readonly e164: string;
    readonly display: string;
    readonly digits: string;
  };
  readonly email: {
    readonly publicContact: string;
    readonly publicConversation: string;
    readonly emailIntakeRecipient: string;
    readonly emailIntakeRouteHeader: string;
    readonly internalLeadInbox: string;
    readonly humanOperator: string;
    readonly customerOutboundFrom: string;
    readonly customerOutboundReplyTo: string;
    readonly customerOutboundBcc: string;
    readonly leadNotificationTo: string;
    readonly leadNotificationFrom: string;
    readonly leadTo: string;
    readonly leadFrom: string;
    readonly emailCustomerFrom: string;
    readonly emailCustomerReplyTo: string;
    readonly quoteCustomerFrom: string;
    readonly quoteCustomerBcc: string;
    readonly quoteCustomerReplyTo: string;
  };
  readonly address: {
    readonly street: string;
    readonly city: string;
    readonly region: string;
    readonly postalCode: string;
    readonly country: string;
    readonly formatted: string;
  };
  readonly maps: {
    readonly appleUrl: string;
  };
  readonly geo: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly hours: ReadonlyArray<{
    readonly days: readonly string[];
    readonly opens: string;
    readonly closes: string;
  }>;
  readonly sameAs: readonly string[];
  readonly quo: {
    readonly contactSource: string;
    readonly contactExternalIdPrefix: string;
    readonly leadTagsFieldName: string;
  };
};

export declare const CRAIGS_BUSINESS_PROFILE: BusinessProfile;

export declare const CRAIGS_LEAD_ENV_DEFAULTS: {
  readonly CONTACT_SITE_LABEL: string;
  readonly LEAD_TO_EMAIL: string;
  readonly LEAD_FROM_EMAIL: string;
  readonly CONTACT_TO_EMAIL: string;
  readonly CONTACT_FROM_EMAIL: string;
  readonly EMAIL_INTAKE_RECIPIENT: string;
  readonly EMAIL_INTAKE_ORIGINAL_RECIPIENT: string;
  readonly EMAIL_INTAKE_GOOGLE_ROUTE_HEADER: string;
  readonly EMAIL_CUSTOMER_FROM_EMAIL: string;
  readonly EMAIL_CUSTOMER_REPLY_TO_EMAIL: string;
  readonly QUOTE_CUSTOMER_FROM_EMAIL: string;
  readonly QUOTE_CUSTOMER_BCC_EMAIL: string;
  readonly QUOTE_CUSTOMER_REPLY_TO_EMAIL: string;
  readonly SHOP_NAME: string;
  readonly SHOP_PHONE_DISPLAY: string;
  readonly SHOP_PHONE_DIGITS: string;
  readonly SHOP_ADDRESS: string;
  readonly QUO_CONTACT_SOURCE: string;
  readonly QUO_CONTACT_EXTERNAL_ID_PREFIX: string;
  readonly QUO_LEAD_TAGS_FIELD_NAME: string;
};

export declare function formatBusinessAddress(profile?: BusinessProfile): string;

export declare function buildSmsSignature(args: {
  shopName: string;
  shopPhoneDisplay: string;
}): string;

export declare function buildEmailSignature(args: {
  shopName: string;
  shopPhoneDisplay: string;
  shopAddress: string;
}): string;
