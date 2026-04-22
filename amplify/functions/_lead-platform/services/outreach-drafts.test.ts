import assert from 'node:assert/strict';
import test from 'node:test';
import { CRAIGS_LEAD_ENV_DEFAULTS } from '@craigs/business-profile/business-profile';
import { buildOutreachDrafts } from './outreach-drafts.ts';

const SHOP_NAME = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_NAME;
const SHOP_PHONE_DISPLAY = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DISPLAY;
const SHOP_PHONE_DIGITS = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_PHONE_DIGITS;
const SHOP_ADDRESS = CRAIGS_LEAD_ENV_DEFAULTS.SHOP_ADDRESS;

function literalPattern(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

test('buildOutreachDrafts creates fallback outreach with canonical signature and address', () => {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: 'Michael',
      vehicle: '2021 Tesla Model Y',
      service: 'Full interior reupholstery in real leather',
      project_summary: null,
    },
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
  });

  assert.equal(
    drafts.emailDraftSubject,
    `${SHOP_NAME} - next steps for 2021 Tesla Model Y - Full interior reupholstery in real leather`,
  );
  assert.match(
    drafts.smsDraft,
    /^Hi Michael - thanks for reaching out about your 2021 Tesla Model Y - Full interior reupholstery in real leather\./,
  );
  assert.match(drafts.smsDraft, literalPattern(SHOP_NAME));
  assert.match(drafts.smsDraft, literalPattern(SHOP_PHONE_DISPLAY));
  assert.match(drafts.emailDraftBody, literalPattern(SHOP_ADDRESS));
});

test('buildOutreachDrafts appends business identity instead of relying on model output', () => {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: 'Michael',
      vehicle: '2021 Tesla Model Y',
      service: null,
      project_summary: null,
    },
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
  });

  assert.match(
    drafts.smsDraft,
    /^Hi Michael - thanks for reaching out about your 2021 Tesla Model Y\./,
  );
  assert.match(drafts.smsDraft, literalPattern(SHOP_NAME));
  assert.match(drafts.smsDraft, literalPattern(SHOP_PHONE_DISPLAY));
  assert.match(drafts.emailDraftBody, literalPattern(SHOP_ADDRESS));
});

test('buildOutreachDrafts works for a second shop without hidden client assumptions', () => {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: 'Jordan',
      vehicle: null,
      service: 'Boat cushion repair',
      project_summary: null,
    },
    shopName: 'Example Upholstery',
    shopPhoneDisplay: '(555) 010-1234',
    shopPhoneDigits: '5550101234',
    shopAddress: '100 Example Ave, Example City, CA 90000',
  });

  assert.match(drafts.smsDraft, /Example Upholstery/);
  assert.match(drafts.smsDraft, /\(555\) 010-1234/);
  assert.match(drafts.emailDraftBody, /100 Example Ave, Example City, CA 90000/);
  assert.doesNotMatch(drafts.smsDraft, literalPattern(SHOP_NAME));
});
