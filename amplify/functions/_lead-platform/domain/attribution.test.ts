import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAttributionSnapshot, sanitizeAttributionSnapshot } from './attribution.ts';

test('sanitizeAttributionSnapshot captures non-Google managed conversion identifiers', () => {
  const attribution = sanitizeAttributionSnapshot({
    li_fat_id: ' li-123 ',
    epik: 'epik-123',
    ScCid: 'snap-123',
    yelp_lead_id: 'yelp-123',
    _fbp: 'fbp-123',
    _ttp: 'ttp-123',
    _scid: 'scid-123',
  });

  assert.equal(attribution?.li_fat_id, 'li-123');
  assert.equal(attribution?.epik, 'epik-123');
  assert.equal(attribution?.sc_click_id, 'snap-123');
  assert.equal(attribution?.yelp_lead_id, 'yelp-123');
  assert.equal(attribution?.fbp, 'fbp-123');
  assert.equal(attribution?.ttp, 'ttp-123');
  assert.equal(attribution?.scid, 'scid-123');
  assert.equal(attribution?.click_id_type, 'li_fat_id');
  assert.equal(attribution?.source_platform, 'linkedin_ads');
  assert.equal(attribution?.acquisition_class, 'paid');
});

test('mergeAttributionSnapshot reads provider click ids from page and click URLs', () => {
  const attribution = mergeAttributionSnapshot(
    null,
    'https://craigs.autos/en/?utm_source=linkedin&utm_medium=cpc&li_fat_id=li-123',
    'https://craigs.autos/en/request-a-quote/?ScCid=snap-123',
  );

  assert.equal(attribution?.li_fat_id, 'li-123');
  assert.equal(attribution?.sc_click_id, 'snap-123');
  assert.equal(attribution?.click_id_type, 'li_fat_id');
  assert.equal(attribution?.source_platform, 'linkedin_ads');
  assert.equal(attribution?.acquisition_class, 'paid');
});
