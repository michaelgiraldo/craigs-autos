import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerFollowupEmailHtml } from './customer-followup-template.ts';

test('customer follow-up email HTML escapes content and preserves paragraph breaks', () => {
  const html = buildCustomerFollowupEmailHtml(
    'First <unsafe> line\nwith a detail.\n\nSecond & final paragraph.',
  );

  assert.match(html, /First &lt;unsafe&gt; line<br \/>with a detail\./);
  assert.match(html, /Second &amp; final paragraph\./);
  assert.equal((html.match(/<p style="margin:0 0 16px;">/g) ?? []).length, 2);
});
