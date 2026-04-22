import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRAIGS_BUSINESS_PROFILE,
  CRAIGS_LEAD_ENV_DEFAULTS,
} from '@craigs/business-profile/business-profile';

const PUBLIC_CONVERSATION_EMAIL = 'contact@craigs.autos';
const INTERNAL_LEAD_INBOX_EMAIL = 'leads@craigs.autos';
const HUMAN_OPERATOR_EMAIL = 'victor@craigs.autos';

test("Craig's email identity roles keep customer automation on the public conversation address", () => {
  const { email } = CRAIGS_BUSINESS_PROFILE;

  assert.equal(email.publicContact, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(email.publicConversation, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(email.internalLeadInbox, INTERNAL_LEAD_INBOX_EMAIL);
  assert.equal(email.humanOperator, HUMAN_OPERATOR_EMAIL);

  assert.equal(email.customerOutboundFrom, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(email.customerOutboundReplyTo, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(email.customerOutboundBcc, INTERNAL_LEAD_INBOX_EMAIL);
  assert.equal(email.leadNotificationFrom, INTERNAL_LEAD_INBOX_EMAIL);
  assert.equal(email.leadNotificationTo, INTERNAL_LEAD_INBOX_EMAIL);

  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.EMAIL_CUSTOMER_FROM_EMAIL, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.EMAIL_CUSTOMER_REPLY_TO_EMAIL, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.QUOTE_CUSTOMER_FROM_EMAIL, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.QUOTE_CUSTOMER_REPLY_TO_EMAIL, PUBLIC_CONVERSATION_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.QUOTE_CUSTOMER_BCC_EMAIL, INTERNAL_LEAD_INBOX_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.CONTACT_FROM_EMAIL, INTERNAL_LEAD_INBOX_EMAIL);
  assert.equal(CRAIGS_LEAD_ENV_DEFAULTS.CONTACT_TO_EMAIL, INTERNAL_LEAD_INBOX_EMAIL);

  assert.notEqual(CRAIGS_LEAD_ENV_DEFAULTS.EMAIL_CUSTOMER_FROM_EMAIL, HUMAN_OPERATOR_EMAIL);
  assert.notEqual(CRAIGS_LEAD_ENV_DEFAULTS.QUOTE_CUSTOMER_FROM_EMAIL, HUMAN_OPERATOR_EMAIL);
});
