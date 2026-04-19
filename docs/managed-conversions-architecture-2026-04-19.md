# Managed Conversions Architecture

Date: 2026-04-19

## Why This Exists

Craig's lead platform should not treat Google Ads upload state as lead truth. A lead can be
qualified, unqualified, booked, completed, or lost regardless of whether any ad platform accepts
conversion feedback later.

The production model is:

```text
visitor behavior -> journey events -> lead record -> business decision -> conversion feedback destinations
```

Google Ads is one destination for managed conversion feedback. It is not the lead lifecycle and it
is not the internal source of truth.

## Provider Research That Changes The Model

The major paid acquisition platforms all support some form of server-side or offline conversion
feedback, but they do not share the same payload shape:

| Destination | Common matching signals | Important implementation constraint |
| --- | --- | --- |
| Google Ads / Google Data Manager | `gclid`, `gbraid`, `wbraid`, hashed email, hashed phone, consent, conversion action, order ID | Successful upload does not guarantee attribution; diagnostics and attribution must be tracked separately. |
| Microsoft Ads | `msclkid`, hashed email, hashed phone, conversion goal name, UTC conversion time | Duplicate rules are tied to click ID and conversion time; enhanced conversions can work without `msclkid` when hashed identity is present. |
| Meta Ads | `fbclid`, `_fbc`, `_fbp`, hashed identity, IP, user agent, `event_id`, `action_source` | `event_id` is critical for deduplication between browser and server events. |
| TikTok Ads | `ttclid`, `_ttp`, hashed identity, event ID, pixel context | Browser pixel and Events API/Gateway should dedupe by event IDs or TikTok cookie signals. |
| LinkedIn Ads | hashed email, `li_fat_id`, conversion rules, external IDs | The destination depends on a configured conversion rule, not just a generic upload flag. |
| Pinterest Ads | `epik`, hashed email, event ID, order ID, value/currency | Events should be sent close to real time and deduped when tag and API both run. |
| Snap Ads | `ScCid` / `sc_click_id`, `_scid`, hashed email, hashed phone, event ID | Event IDs and normalized hashed identifiers are needed for reliable dedupe and matching. |
| Yelp Ads | hashed email, hashed phone, IP/user agent, Yelp lead ID, event ID | Yelp can receive server-side events and dedupe on `event_id` + event name. |

Official references:

- [Google Ads API conversion management](https://developers.google.com/google-ads/api/docs/conversions/overview)
- [Google enhanced conversions for leads](https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions/leads-setup)
- [Google Data Manager events](https://developers.google.com/data-manager/api/devguides/events)
- [Microsoft Advertising OfflineConversion](https://learn.microsoft.com/en-us/advertising/campaign-management-service/offlineconversion?view=bingads-13)
- [Microsoft Advertising ApplyOfflineConversions](https://learn.microsoft.com/en-us/advertising/campaign-management-service/applyofflineconversions?view=bingads-13)
- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [TikTok Events API Gateway](https://ads.tiktok.com/help/article/about-events-api-gateway)
- [LinkedIn Conversions API](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api?view=li-lms-2026-04)
- [Pinterest Conversions API](https://help.pinterest.com/en/business/article/the-pinterest-api-for-conversions)
- [Snap Conversions API parameters](https://developers.snap.com/api/marketing-api/Conversions-API/Parameters)
- [Yelp Conversions API](https://docs.developer.yelp.com/docs/conversions-api)

## Before And After

| Before | After |
| --- | --- |
| `LeadQualificationSnapshot` stored `uploaded_google_ads`. | Qualification stores only the business decision: qualified or not qualified. |
| Admin displayed a `Google Ads` column. | Admin displays provider-neutral `Conversion Feedback` readiness. |
| One boolean tried to represent upload, acceptance, and attribution. | Feedback has statuses: not ready, needs signal, needs destination config, ready, queued, sent, accepted, warning, failed, attributed, suppressed, retracted. |
| Attribution primarily captured Google/Microsoft/Meta/TikTok click IDs. | Attribution also captures LinkedIn, Pinterest, Snap, Yelp, and browser IDs used by server-side feedback loops. |
| A future non-Google provider would require another lead-record refactor. | New destinations attach behind the managed-conversion contract without changing lead truth. |

## Current Source Of Truth

The shared contract lives in:

- `packages/contracts/src/managed-conversion-contract.js`
- `packages/contracts/src/managed-conversion-contract.d.ts`

It owns:

- supported feedback destination keys
- destination labels
- click ID and browser ID signal requirements
- feedback statuses
- decision types
- provider-neutral readiness summary logic

The admin view consumes the summary. It should never infer that a qualified lead has already been
uploaded, accepted, or attributed unless a provider outcome record says so.

Admin readiness can be scoped with:

```text
MANAGED_CONVERSION_DESTINATIONS=google_ads,microsoft_ads,meta_ads
```

If this is empty, a qualified lead with signals will show that destination configuration is still
needed instead of pretending that a provider upload is pending.

## Implementation Rule

Use three separate concepts:

| Concept | Meaning | Example |
| --- | --- | --- |
| Lead record | Customer/job truth. | "This quote request is qualified." |
| Conversion decision | Business feedback worth sending. | "Send qualified lead feedback." |
| Feedback outcome | Destination-specific delivery result. | "Google accepted the event with warning X." |

Provider outcomes are evidence about delivery and attribution. They are not the lead lifecycle.

## Future Work

The next production slice should add durable feedback storage:

- `LeadConversionDecisions`
- `LeadConversionFeedbackOutbox`
- `LeadConversionFeedbackOutcomes`
- `ProviderConversionDestinations`

Those tables should be added only after destination configuration and upload worker behavior are
ready. Until then, admin readiness is intentionally a summary, not a fake upload state.
