import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeadContactIdentity, mergeLeadContacts } from './contact-identity.ts';

test('buildLeadContactIdentity emits contact points and high-confidence typed form observations', () => {
  const identity = buildLeadContactIdentity({
    name: 'Chris Mikkelsen',
    phone: '(408) 555-0100',
    email: 'Chris@example.com',
    sourceChannel: 'form',
    sourceMethod: 'typed',
    sourceEventId: 'quote-1',
    nameConfidence: 'high',
    contactPointConfidence: 'high',
    occurredAtMs: 1_000,
  });

  assert.equal(identity.contact?.display_name, 'Chris Mikkelsen');
  assert.equal(identity.contact?.display_name_confidence, 'high');
  assert.equal(identity.contact?.normalized_phone, '+14085550100');
  assert.equal(identity.contact?.normalized_email, 'chris@example.com');
  assert.equal(identity.contactPoints.length, 2);
  assert.deepEqual(identity.contactObservations.map((observation) => observation.kind).sort(), [
    'email',
    'name',
    'phone',
  ]);
});

test('mergeLeadContacts promotes stronger name evidence over weaker header fallback', () => {
  const headerIdentity = buildLeadContactIdentity({
    name: 'Chris',
    email: 'chris@example.com',
    sourceChannel: 'email',
    sourceMethod: 'email_header',
    nameConfidence: 'low',
    contactPointConfidence: 'medium',
    occurredAtMs: 1_000,
  });
  const formIdentity = buildLeadContactIdentity({
    name: 'Chris Mikkelsen',
    email: 'chris@example.com',
    sourceChannel: 'form',
    sourceMethod: 'typed',
    nameConfidence: 'high',
    contactPointConfidence: 'high',
    occurredAtMs: 2_000,
  });

  assert.ok(headerIdentity.contact);
  assert.ok(formIdentity.contact);

  const merged = mergeLeadContacts(headerIdentity.contact, formIdentity.contact);
  assert.equal(merged.display_name, 'Chris Mikkelsen');
  assert.equal(merged.display_name_confidence, 'high');
  assert.equal(merged.display_name_source_channel, 'form');
});

test('mergeLeadContacts uses the more complete name when confidence ties', () => {
  const first = buildLeadContactIdentity({
    name: 'Nadia',
    email: 'nadia@example.com',
    sourceChannel: 'chat',
    sourceMethod: 'ai_extracted',
    nameConfidence: 'medium',
    occurredAtMs: 1_000,
  });
  const second = buildLeadContactIdentity({
    name: 'Nadia Lukyanova',
    email: 'nadia@example.com',
    sourceChannel: 'email',
    sourceMethod: 'ai_extracted',
    nameConfidence: 'medium',
    occurredAtMs: 2_000,
  });

  assert.ok(first.contact);
  assert.ok(second.contact);

  const merged = mergeLeadContacts(first.contact, second.contact);
  assert.equal(merged.display_name, 'Nadia Lukyanova');
});
