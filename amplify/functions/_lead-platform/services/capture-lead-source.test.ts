import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLeadFollowupWorkItem,
  type LeadFollowupWorkItem,
} from '../domain/lead-followup-work.ts';
import type { LeadPlatformRepos } from '../repos/dynamo.ts';
import { captureLeadSource } from './capture-lead-source.ts';

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

function makeRepos(existingWork: LeadFollowupWorkItem): LeadPlatformRepos {
  return {
    followupWork: {
      acquireLease: async () => false,
      getByFollowupWorkId: async () => existingWork,
      getByIdempotencyKey: async () => existingWork,
      put: async () => undefined,
      putIfAbsent: async () => false,
    },
  } as unknown as LeadPlatformRepos;
}

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
