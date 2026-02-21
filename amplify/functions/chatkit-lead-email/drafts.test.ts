import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLeadEmailSubject, buildOutreachDrafts } from './drafts.ts';

const SHOP_NAME = "Craig's Auto Upholstery";
const SHOP_PHONE_DISPLAY = '(408) 379-3820';
const SHOP_PHONE_DIGITS = '4083793820';
const SHOP_ADDRESS = '271 Bestor St, San Jose, CA 95112';

test('buildLeadEmailSubject prefers vehicle and project context', () => {
  const subject = buildLeadEmailSubject({
    leadSummary: {
      vehicle: '2021 Tesla Model Y',
      project: 'Full interior reupholstery in real leather',
    },
    threadTitle: 'Ignored title',
  });

  assert.equal(
    subject,
    'New chat lead: 2021 Tesla Model Y - Full interior reupholstery in real leather',
  );
});

test('buildLeadEmailSubject falls back to thread title', () => {
  const subject = buildLeadEmailSubject({
    leadSummary: {
      vehicle: null,
      project: null,
    },
    threadTitle: 'Seat repair question',
  });

  assert.equal(subject, 'New chat lead: Seat repair question');
});

test('buildOutreachDrafts creates fallback outreach with signature and address', () => {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: 'Michael',
      vehicle: '2021 Tesla Model Y',
      project: 'Full interior reupholstery in real leather',
      outreach_message: null,
    },
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
  });

  assert.equal(
    drafts.emailDraftSubject,
    "Craig's Auto Upholstery - next steps for 2021 Tesla Model Y - Full interior reupholstery in real leather",
  );
  assert.match(
    drafts.smsDraft,
    /^Hi Michael - thanks for reaching out to Craig's Auto Upholstery about your 2021 Tesla Model Y - Full interior reupholstery in real leather\./,
  );
  assert.match(drafts.smsDraft, /\(408\) 379-3820/);
  assert.match(drafts.emailDraftBody, /271 Bestor St, San Jose, CA 95112/);
});

test('buildOutreachDrafts preserves provided outreach text while ensuring required signature fields', () => {
  const drafts = buildOutreachDrafts({
    leadSummary: {
      customer_name: 'Michael',
      vehicle: '2021 Tesla Model Y',
      project: null,
      outreach_message:
        "Hi Michael-this is Craig's Auto Upholstery. Please send photos when you can.",
    },
    shopName: SHOP_NAME,
    shopPhoneDisplay: SHOP_PHONE_DISPLAY,
    shopPhoneDigits: SHOP_PHONE_DIGITS,
    shopAddress: SHOP_ADDRESS,
  });

  assert.match(drafts.smsDraft, /Hi Michael-this is Craig's Auto Upholstery\./);
  assert.match(drafts.smsDraft, /\(408\) 379-3820/);
  assert.match(drafts.emailDraftBody, /271 Bestor St, San Jose, CA 95112/);
});
