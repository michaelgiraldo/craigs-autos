# QUO Provider Readiness

QUO is a first-class lead-platform provider capability, not a top-level lead
concept. SMS is the customer response channel; QUO is Craig's current SMS
provider and contact-sync destination.

## Stage 1: launch-ready provider layer

- Provider contracts live under `amplify/functions/_lead-platform/services/providers/`.
- QUO implementation lives under `amplify/functions/_lead-platform/services/providers/quo/`.
- `lead-followup-worker` still orchestrates the first response, but depends on
  provider readiness and `MessagingProvider` behavior instead of worker-local
  QUO helper code.
- QUO remains disabled by default until the production sender and carrier
  registration are verified.

Required launch configuration:

| Key | Purpose |
| --- | --- |
| `QUO_ENABLED` | Must be `true` only after live readiness is verified. |
| `QUO_API_KEY` | Amplify secret used by the worker for QUO API calls. |
| `QUO_FROM_PHONE_NUMBER_ID` | QUO sender id, expected to start with `PN`. |
| `QUO_USER_ID` | Optional QUO user id, expected to start with `US` when present. |
| `QUO_CONTACT_SOURCE` | Stable external contact source name. |
| `QUO_CONTACT_EXTERNAL_ID_PREFIX` | Stable prefix for QUO external ids. |
| `QUO_LEAD_TAGS_FIELD_KEY` / `QUO_LEAD_TAGS_FIELD_NAME` | Contact custom field used for lead tags. |

Current verified setup:

| Value | Status |
| --- | --- |
| `(408) 379-3820` QUO phone number id | `PNkd7bfrir` |
| `(408) 379-3820` QUO user id | `USwARwIZne` |
| `(408) 379-3820` porting status | `scheduled` as of 2026-04-22 |
| US/Canada messaging restriction | `unrestricted` as of 2026-04-22 |
| `QUO_API_KEY` | Stored in Amplify Secret Management |
| `QUO_ENABLED` | `false` until the approved live SMS smoke test |
| Contact custom field | `Tags`, key `69e95720a08b1f74fc5e6313` |

Secret resolution behavior:

- Keep `QUO_API_KEY` as an Amplify all-branches secret unless a branch truly needs
  a different value.
- Do not judge secret propagation by reading the Lambda environment value from
  `get-function-configuration`. Amplify stores the placeholder
  `<value will be resolved during runtime>` there by design.
- At Lambda cold start, Amplify's runtime shim reads `AMPLIFY_SSM_ENV_CONFIG`,
  tries the branch-specific SSM path first, and falls back to the shared
  all-branches path when the branch path does not exist.
- The lead follow-up worker role must have `ssm:GetParameters` access to both
  the branch and shared `QUO_API_KEY` paths.
- As of 2026-04-22, the branch-specific `QUO_API_KEY` path is intentionally
  absent, the shared path exists, the worker role can read both configured paths,
  and the shared key successfully reaches the QUO phone-numbers API.
- The QUO provider treats Amplify's unresolved placeholder as a missing API key,
  so a failed runtime resolution cannot accidentally look like a ready provider.

The QUO `Tags` multi-select field should include `Form Lead`, `Chat Lead`, and
`Email Lead`. The QUO API can read contact custom fields, but the public docs
state custom field definitions must be created or modified in QUO itself.

Runtime rules:

- SMS recipients must be explicit E.164 numbers or normal 10/11 digit US
  phone numbers that can be normalized safely.
- SMS content must be nonempty and 1,600 characters or fewer.
- If QUO is disabled or not ready, form/chat leads fall back to customer email
  when available or manual follow-up when phone-only.
- Email intake remains email-first and does not attempt SMS.
- QUO contact sync only runs after a successful QUO SMS outreach result.
- QUO contact ids and synced tags are stored as provider contact projections; the
  canonical `LeadContact` remains provider-neutral.

## Stage 2: durable provider outboxes

After the live QUO path is proven stable, split provider side effects out of the
follow-up worker:

- `LeadDeliveryAttempts`: durable customer-message attempts by provider/channel.
- `LeadProviderSyncAttempts`: durable provider sync attempts such as QUO contact
  updates.
- `lead-message-delivery-worker`: leases and sends message attempts.
- `lead-provider-sync-worker`: leases and runs destination sync attempts.

Do not add these tables or workers during the launch-hardening stage.
