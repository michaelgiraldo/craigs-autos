import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLeadEmailSubject } from './drafts.ts';

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
