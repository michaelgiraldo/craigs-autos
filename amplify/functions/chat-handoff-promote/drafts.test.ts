import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLeadEmailSubject } from './drafts.ts';

test('buildLeadEmailSubject prefers vehicle and project context', () => {
  const subject = buildLeadEmailSubject({
    leadSummary: {
      vehicle: '2021 Tesla Model Y',
      service: 'Full interior reupholstery in real leather',
      project_summary: null,
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
      service: null,
      project_summary: null,
    },
    threadTitle: 'Seat repair question',
  });

  assert.equal(subject, 'New chat lead: Seat repair question');
});
