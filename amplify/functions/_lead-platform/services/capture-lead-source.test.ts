import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { captureLeadSource, shouldRepairLeadSourceWork } from './capture-lead-source.ts';

function makeWorkItem(status: 'queued' | 'processing' | 'completed' | 'error') {
  return {
    ...createLeadFollowupWorkItem({
      attribution: null,
      captureChannel: 'chat',
      email: 'customer@example.com',
      followupWorkId: 'chat_cthr_123',
      idempotencyKey: 'chat:cthr_123',
      journeyId: 'journey-chat',
      leadRecordId: 'lead-chat',
      locale: 'en',
      message: 'Customer needs upholstery help.',
      name: 'Customer',
      nowEpochSeconds: 1_000,
      origin: 'chat:idle',
      pageUrl: 'https://craigs.autos',
      phone: '',
      service: 'seat repair',
      siteLabel: 'craigs.autos',
      sourceEventId: 'cthr_123',
      userId: 'anon-user',
      vehicle: 'Toyota Camry',
    }),
    status,
  };
}

function makeRepos(
  existingWork: LeadFollowupWorkItem,
  writes: LeadFollowupWorkItem[] = [],
): LeadPlatformRepos {
  return {
    followupWork: {
      acquireLease: async () => false,
      getByIdempotencyKey: async () => existingWork,
      put: async (record: LeadFollowupWorkItem) => {
        writes.push({ ...record });
      },
      putIfAbsent: async () => false,
    },
  } as unknown as LeadPlatformRepos;
}

test('shouldRepairLeadSourceWork identifies only incomplete idle queued work', () => {
  const incompleteQueued = {
    ...makeWorkItem('queued'),
    contact_id: null,
    journey_id: null,
    lead_record_id: null,
  };

  assert.equal(shouldRepairLeadSourceWork(incompleteQueued), true);
  assert.equal(shouldRepairLeadSourceWork(makeWorkItem('queued')), false);
  assert.equal(shouldRepairLeadSourceWork(makeWorkItem('processing')), false);
  assert.equal(shouldRepairLeadSourceWork(makeWorkItem('completed')), false);
  assert.equal(shouldRepairLeadSourceWork(makeWorkItem('error')), false);
  assert.equal(
    shouldRepairLeadSourceWork({
      ...incompleteQueued,
      lease_id: 'lease-1',
      lock_expires_at: 3_000,
    }),
    false,
  );
});

test('captureLeadSource reports existing errored work as worker_failed', async () => {
  const existingWork = makeWorkItem('error');
  let persisted = false;
  let invoked = false;

  const receipt = await captureLeadSource({
    invokeFollowup: async () => {
      invoked = true;
    },
    nowEpochSeconds: () => 2_000,
    persistLead: async () => {
      persisted = true;
      return null;
    },
    repos: makeRepos(existingWork),
    workItem: makeWorkItem('queued'),
  });

  assert.equal(receipt.status, 'worker_failed');
  assert.equal(receipt.followupWorkStatus, 'error');
  assert.equal(receipt.workItem, existingWork);
  assert.equal(persisted, false);
  assert.equal(invoked, false);
});

test('captureLeadSource repairs incomplete queued work before invoking follow-up', async () => {
  const existingWork = {
    ...makeWorkItem('queued'),
    contact_id: null,
    journey_id: null,
    lead_record_id: null,
  };
  const writes: LeadFollowupWorkItem[] = [];
  const invoked: string[] = [];
  let persisted = false;

  const receipt = await captureLeadSource({
    invokeFollowup: async (idempotencyKey) => {
      invoked.push(idempotencyKey);
    },
    nowEpochSeconds: () => 2_000,
    persistLead: async () => {
      persisted = true;
      return {
        contactId: 'contact-repaired',
        journeyId: 'journey-repaired',
        leadRecordId: 'lead-repaired',
      };
    },
    repos: makeRepos(existingWork, writes),
    workItem: makeWorkItem('queued'),
  });

  assert.equal(receipt.status, 'accepted');
  assert.equal(receipt.followupWorkId, existingWork.followup_work_id);
  assert.equal(receipt.leadRecordId, 'lead-repaired');
  assert.equal(receipt.workItem?.contact_id, 'contact-repaired');
  assert.equal(receipt.workItem?.journey_id, 'journey-repaired');
  assert.equal(receipt.workItem?.lead_record_id, 'lead-repaired');
  assert.equal(persisted, true);
  assert.deepEqual(invoked, ['chat:cthr_123']);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.lead_record_id, 'lead-repaired');
});

test('captureLeadSource does not rerun side effects for complete queued work', async () => {
  const existingWork = makeWorkItem('queued');
  const writes: LeadFollowupWorkItem[] = [];
  let persisted = false;
  let invoked = false;

  const receipt = await captureLeadSource({
    invokeFollowup: async () => {
      invoked = true;
    },
    nowEpochSeconds: () => 2_000,
    persistLead: async () => {
      persisted = true;
      return null;
    },
    repos: makeRepos(existingWork, writes),
    workItem: makeWorkItem('queued'),
  });

  assert.equal(receipt.status, 'already_accepted');
  assert.equal(receipt.workItem, existingWork);
  assert.equal(persisted, false);
  assert.equal(invoked, false);
  assert.equal(writes.length, 0);
});
