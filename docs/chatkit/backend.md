# ChatKit lead intake - backend (AWS Amplify Gen2)

This document describes the AWS backend for ChatKit lead intake:

- How sessions are minted (ephemeral client secrets)
- How transcripts are fetched, evaluated, persisted, and queued for shared follow-up
- How idempotency is enforced through `LeadFollowupWork`

Related docs:

- Overview: `docs/chatkit/overview.md`
- Frontend: `docs/chatkit/frontend.md`
- Agent Builder: `docs/chatkit/agent-builder.md`
- Runbook: `docs/chatkit/runbook.md`
- Attachment storage decision: `docs/chatkit/attachment-storage-decision.md`

## Key files

- `amplify/backend.ts`
  - Defines the Amplify Gen2 backend via CDK:
    - Lambda functions
    - Public HTTP API routes
    - API CORS configuration
    - SES IAM permissions for the shared follow-up worker
    - DynamoDB `LeadFollowupWork` table
    - Journey-first lead tables
    - Build outputs (`custom.api_base_url`)

- Session minting function:
  - `amplify/functions/chat-session-create/resource.ts`
  - `amplify/functions/chat-session-create/handler.ts`

- Chat lead handoff function:
  - `amplify/functions/chat-handoff-promote/resource.ts`
  - `amplify/functions/chat-handoff-promote/handler.ts`
  - `amplify/functions/chat-handoff-promote/lead-summary.ts`
  - `amplify/functions/chat-handoff-promote/transcript.ts`

- Shared first-response worker:
  - `amplify/functions/lead-followup-worker/handler.ts`
  - `amplify/functions/lead-followup-worker/process-lead-followup-worker.ts`
  - `amplify/functions/lead-followup-worker/workflow.ts`
  - `amplify/functions/lead-followup-worker/customer-email.ts`
  - `amplify/functions/lead-followup-worker/lead-notification-email.ts`
  - `amplify/functions/_lead-platform/services/providers/quo/quo-provider.ts`
  - `amplify/functions/_lead-platform/services/providers/ses/ses-provider.ts`

- Message link resolver function:
  - `amplify/functions/lead-action-link-resolve/resource.ts`
  - `amplify/functions/lead-action-link-resolve/handler.ts`

Build/deploy pipeline:

- `amplify.yml` (runs `ampx pipeline-deploy` to generate `public/amplify_outputs.json`)

## Secrets and environment variables

### Amplify Secrets (required)

These must be set per Amplify environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`

They are referenced in code via Amplify's `secret(...)`:

- `amplify/functions/chat-session-create/resource.ts`
- `amplify/functions/chat-handoff-promote/resource.ts`

### Function environment variables (defaults)

Craig's business identity and lead-delivery defaults are sourced from
`packages/business-profile/src/business-profile.js`. Runtime resources should import
`CRAIGS_LEAD_ENV_DEFAULTS` instead of duplicating shop name, phone, address,
email, domain, map URL, QUO source, or QUO external-id strings.

- `LEAD_SUMMARY_MODEL` (default from `@craigs/contracts/lead-ai-policy`)
- `MANAGED_CONVERSION_DESTINATIONS` (legacy/env bootstrap only; prefer the config-as-code CLI below)

Journey-first lead wiring (injected by `amplify/backend.ts`):

- `LEAD_CONTACTS_TABLE_NAME`
- `LEAD_JOURNEYS_TABLE_NAME`
- `LEAD_JOURNEY_EVENTS_TABLE_NAME`
- `LEAD_FOLLOWUP_WORK_TABLE_NAME`
- `LEAD_RECORDS_TABLE_NAME`
- `LEAD_CONVERSION_DECISIONS_TABLE_NAME`
- `LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME`
- `LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME`
- `PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME`

Follow-up producer wiring (injected by `amplify/backend/dynamo/lead-data.ts`):

- `LEAD_FOLLOWUP_WORKER_FUNCTION_NAME` on quote submit, email intake, and chat handoff

Action-link resolver wiring:

- `LEAD_ACTION_LINKS_TABLE_NAME` on `lead-action-link-resolve`

Managed-conversion worker defaults:

- `MANAGED_CONVERSION_FEEDBACK_BATCH_SIZE` (default `10`)
- `MANAGED_CONVERSION_FEEDBACK_LEASE_SECONDS` (default `300`)
- `MANAGED_CONVERSION_FEEDBACK_MAX_ATTEMPTS` (default `3`)
- `GOOGLE_ADS_CONVERSION_FEEDBACK_MODE` (default `dry_run`; supported modes: `disabled`, `dry_run`, `test`/`validate_only`, `live`)
- `GOOGLE_ADS_API_VERSION` (default `v24`)
- `GOOGLE_ADS_ENDPOINT_BASE` (default `https://googleads.googleapis.com`)
- `GOOGLE_ADS_CUSTOMER_ID` (required for Google Ads dry-run validation)
- `GOOGLE_ADS_CONVERSION_ACTION_RESOURCE_NAME` or `GOOGLE_ADS_CONVERSION_ACTION_ID` (required for Google Ads dry-run validation)
- `GOOGLE_ADS_DEFAULT_CONVERSION_VALUE` (optional)
- `GOOGLE_ADS_CURRENCY_CODE` (default `USD`)
- `GOOGLE_ADS_AD_USER_DATA_CONSENT` (`GRANTED` or `DENIED`, required unless account-level consent configuration is explicitly confirmed)
- `GOOGLE_ADS_ACCOUNT_DEFAULT_CONSENT_CONFIGURED` (`true` only when Google Ads account-level consent configuration is intentionally used)
- `GOOGLE_ADS_ACCESS_TOKEN` (optional short-lived token for Google Ads `test`/`live`; prefer refresh-token configuration)
- `GOOGLE_ADS_REFRESH_TOKEN` / `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` (preferred for Google Ads `test`/`live` so the worker can mint fresh access tokens)
- `GOOGLE_ADS_TOKEN_ENDPOINT` (default `https://oauth2.googleapis.com/token`)
- `GOOGLE_ADS_DEVELOPER_TOKEN` (required for Google Ads `test`/`live` API delivery)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional manager-account header)
- `YELP_CONVERSION_FEEDBACK_MODE` (default `dry_run`; supported modes: `disabled`, `dry_run`, `test`/`test_event`, `live`)
- `YELP_CONVERSION_ENDPOINT_BASE` (default `https://api.yelp.com`)
- `YELP_CONVERSION_API_KEY` (required for Yelp `test`/`live` API delivery)
- `YELP_CONVERSION_DEFAULT_EVENT_NAME` (default `lead`)
- `YELP_CONVERSION_ACTION_SOURCE` (default `website`)
- `YELP_CONVERSION_CURRENCY_CODE` (default `USD`; Yelp supports `USD` and `CAD`)

These provider environment keys are declared once in provider config fields and collected by
`amplify/functions/_lead-platform/services/conversion-feedback/provider-config-manifest.ts`.
`resource.ts` uses that manifest for Lambda defaults, and `runtime.ts` uses the same manifest for
environment validation. Do not add a provider env var directly to the worker resource/runtime
without adding it to the provider's config fields.

Provider destination setup is config/CLI driven, not admin UI driven:

- Desired state: `config/managed-conversion-destinations.json`
- Validate: `npm run managed-conversions:validate`
- Readiness: `npm run managed-conversions:readiness`
- Env template: `npm run managed-conversions:env-template`
- DynamoDB sync/list: `npm run managed-conversions -- sync|list --table ... --profile ...`
- Runbook: `docs/managed-conversions-ops.md`

The scheduled worker lives in `amplify/functions/managed-conversion-feedback-worker/`.
It currently ships with a provider SDK under
`amplify/functions/_lead-platform/services/conversion-feedback/`. Provider-specific `definition.ts`
files declare config fields, parsing, payload building, live-config checks, and delivery. The shared
adapter factory handles disabled mode, dry-run validation, missing live config, and HTTP dependency
injection. The registry includes manual export, Google Ads, and Yelp Ads adapters. `dry_run` builds
and validates payloads locally without a provider call. `test` calls the provider validation mode
when available: Google Ads uses `validateOnly`, and Yelp uses `test_event`. `live` sends real
conversion feedback and records the provider outcome.

Lifecycle rules:

- Canonical lead event names and their lifecycle/dataLayer/browser interaction contract
  live in `packages/contracts/src/lead-event-contract.js`.
- Event lifecycle rules live in `amplify/functions/_lead-platform/domain/lead-lifecycle.ts`.
- Event classification details live in `amplify/functions/_lead-platform/domain/lead-semantics.ts`.
- `lead-lifecycle.ts` and `lead-semantics.ts` must derive from the shared contract;
  they should not become separate event vocabularies.
- The active lifecycle refactor plan and edge-case matrix live in `docs/lead-platform-lifecycle-plan-2026-04-18.md`.
- Meaningful visitor actions should append journey events; only quote submit success and completed chat handoff currently promote a journey to a lead record.

Shared lead follow-up code:

- Follow-up work record types and default state live in `amplify/functions/_lead-platform/domain/lead-followup-work.ts`.
- Follow-up work DynamoDB access lives in `amplify/functions/_lead-platform/repos/dynamo/followup-work.ts`.
- Form lead persistence and follow-up-to-lead sync live in `amplify/functions/_lead-platform/services/followup-work.ts`.
- Quote request HTTP response mapping lives in `amplify/functions/quote-request-submit/handler.ts`.
- Quote request parsing, validation, submit orchestration, and AWS runtime wiring live in separate files under `amplify/functions/quote-request-submit/`.
- The shared follow-up worker HTTP response mapping lives in `amplify/functions/lead-followup-worker/handler.ts`.
- Follow-up orchestration, state transitions, DynamoDB storage, SES delivery, lead sync, and AWS/OpenAI runtime wiring live in separate files under `amplify/functions/lead-followup-worker/`.
- QUO SMS delivery is exposed through provider contracts under `amplify/functions/_lead-platform/services/providers/`.
- Public submit/intake/handoff handlers should reserve `LeadFollowupWork`; they should not send SES or QUO directly.

Shared backend utilities:

- Generic text/URL/email/phone helpers live in `amplify/functions/_shared/text-utils.ts`.
- The QUO API client and provider readiness live under `amplify/functions/_lead-platform/services/providers/quo/`.
- Shared outreach draft assembly lives in `amplify/functions/_lead-platform/services/outreach-drafts.ts`.
- Chat-specific transcript parsing and subject behavior stays under `amplify/functions/chat-handoff-promote/`.

## Endpoints and discovery

The backend exposes one public HTTP API and routes stable paths to Lambdas.

Routes are defined in `amplify/backend/public-api.ts`:

- `POST /quote-requests` -> `quote-request-submit`
- `POST /chat-sessions` -> `chat-session-create`
- `POST /chat-handoffs` -> `chat-handoff-promote`
- `GET /lead-action-links` -> `lead-action-link-resolve`
- `POST /lead-interactions` -> `lead-interaction-capture`
- `GET /admin/leads` -> `lead-admin-api`
- `POST /admin/leads/qualification` -> `lead-admin-api`
- Admin notes and follow-up state routes are intentionally not exposed until their handlers exist.

During Amplify builds, `ampx pipeline-deploy` writes `public/amplify_outputs.json`.
The frontend fetches `/amplify_outputs.json` and reads:

- `custom.api_base_url`
- `custom.api_contract`

Browser code composes route URLs from the base URL. This avoids hardcoding per-branch endpoints while keeping the public contract route-based.

Note:

- Message handoff links now use `https://craigs.autos/message/?token=...` (with optional `channel=...`).
- Legacy SMS-subdomain routing and old SMS-named output key conventions are removed in Phase 1.

## CORS

CORS is configured on the public HTTP API in `amplify/backend/public-api.ts`.

Allowed origins currently include:

- `https://chat.craigs.autos`
- `https://craigs.autos`
- `http://localhost:4321`
- `http://127.0.0.1:4321`

If you add a new domain (or new preview host), update this list and redeploy.

## Session minting function (chat-session-create)

Purpose:

- Keep OpenAI secrets server-side
- Create a ChatKit session and return a short-lived `client_secret` to the browser

Implementation:

- `amplify/functions/chat-session-create/handler.ts`

Core call:

```ts
await openai.beta.chatkit.sessions.create({
  user,
  workflow: {
    id: workflowId,
    state_variables: {
      locale,
      page_url: pageUrl,
      ...shopState
    },
  },
});
```

### Shop-local time state variables

The backend injects server-computed time fields so the agent can answer:

- "What day is it?"
- "Are you open?"
- "When do you open next?"

Without guessing or hallucinating.

State variables injected:

- `shop_timezone` (America/Los_Angeles)
- `shop_local_weekday` (Sunday..Saturday)
- `shop_local_time_24h` (HH:mm)
- `shop_is_open_now` (boolean)
- `shop_next_open_day` (string)
- `shop_next_open_time` (string, ex: 8:00 AM)

These are computed in `computeShopState(...)`.

If shop hours change, update:

- `scheduleForWeekday(...)` in:
  - `amplify/functions/chat-session-create/handler.ts`
  - `server/chatkit-dev.mjs` (local dev mirror)

## Chat lead handoff function (chat-handoff-promote)

Purpose:

- Given a ChatKit thread id (`cthr_...`), fetch the transcript
- Extract actionable contact info
- Generate internal helper content (summary/next steps/call script/outreach)
- Persist the captured lead journey
- Enqueue `LeadFollowupWork` for the shared worker
- Enforce first-response idempotency through `LeadFollowupWork.idempotency_key`

Implementation:

- `amplify/functions/chat-handoff-promote/handler.ts`

### Processing pipeline (high level)

1) Validate input (must include a valid `cthr_...`)
2) Dedupe fast path:
   - If `LeadFollowupWork.idempotency_key = chat:<threadId>` already exists,
     return `status = "already_accepted"`, `status = "worker_failed"`, or
     `status = "worker_completed"`
3) Fetch transcript from OpenAI:
   - `openai.beta.chatkit.threads.retrieve(threadId)`
   - `openai.beta.chatkit.threads.listItems(threadId, { order: "asc" })` (paged)
4) Convert ChatKit items into normalized transcript lines:
   - "Customer" lines from `chatkit.user_message`
   - "Roxana" lines from `chatkit.assistant_message`
   - attachments included as text lines (name/mime/hosted preview URL)
5) Extract contact info from customer messages only:
   - email regex
   - phone regex (excluding the configured shop phone digits)
6) Generate internal lead summary:
   - OpenAI Responses API: `openai.responses.parse(...)`
   - Strict JSON schema (Structured Outputs)
   - Output includes:
     - normalized `LeadSummary` facts, missing info, and recommended next steps
     - customer language
     - customer response policy: `automatic` or `manual_review`
   - Customer SMS/email copy is generated later by `lead-followup-worker`; the chat
     summary does not own outreach copy.
7) Decide whether to complete the handoff now:
   - Current triggers (`idle`, `pagehide`, `chat_closed`) attempt handoff once contact exists.
   - We intentionally avoid "handoff after every assistant response" because it can
     snapshot the thread mid-conversation (see `docs/chatkit/chat-handoff-promote-before-after.md`).
   - Missing contact and not-idle still block/defer. Ambiguous transcript summaries are
     captured as `manual_review` leads instead of being dropped.
8) Reserve `LeadFollowupWork` with `idempotency_key = chat:<threadId>`.
9) Persist the journey-first lead bundle.
10) Update the reserved work item with contact/journey/lead ids.
11) Asynchronously invoke `lead-followup-worker`.

### Idempotency: LeadFollowupWork

Idempotency is required because the frontend can call the chat lead handoff endpoint
multiple times:

- after idle
- on tab hide/unload
- on manual close

Also: users can open multiple tabs/devices.

Design:

- DynamoDB table: `LeadFollowupWork`
  - partition key: `idempotency_key` (string)
  - status GSI: `status-updated_at-index`
  - TTL attribute: `ttl`
  - removal policy: `DESTROY` in this hard-cut implementation

Source contract:

- `idempotency_key` is the canonical uniqueness key for first response work.
- `followup_work_id` is a deterministic id derived from `idempotency_key`; it is
  for logs, API responses, and support lookups, not uniqueness.
- Current prefixes are `form:...`, `email:...`, and `chat:<cthr_...>`.

Semantics:

- `status = "blocked"`: chat is not actionable; no follow-up work exists.
- `status = "deferred"`: chat is still active/not idle; no follow-up work exists.
- `status = "accepted"`: this request reserved work, persisted the lead, and invoked the worker.
- `status = "already_accepted"`: work already exists in `queued` or `processing`; no lead persistence or worker invocation is rerun.
- Incomplete queued work with missing lead linkage is treated as repairable: the
  endpoint re-runs idempotent lead persistence, updates the reserved work item,
  invokes the worker, and returns `status = "accepted"`.
- `status = "worker_failed"`: work already exists in `error`; no lead persistence or worker invocation is rerun, and the frontend keeps the handoff eligible for a future retry/operator repair instead of marking it completed.
- `status = "worker_completed"`: work already exists in `completed`.
- The worker owns leasing with `LEAD_FOLLOWUP_LEASE_SECONDS`.

### SES and QUO delivery

SES and QUO delivery are centralized in `lead-followup-worker`, not `chat-handoff-promote`.

Permissions:

- `ses:SendEmail`
- `ses:SendRawEmail`

are granted to the worker in backend wiring.

Delivery code:

- Customer email: `amplify/functions/lead-followup-worker/customer-email.ts`
- Lead notification email: `amplify/functions/lead-followup-worker/lead-notification-email.ts`
- SES email provider: `amplify/functions/_lead-platform/services/providers/ses/ses-provider.ts`
- Customer follow-up template: `amplify/functions/lead-followup-worker/customer-followup-template.ts`
- Lead notification email template: `amplify/functions/lead-followup-worker/lead-notification-template.ts`
- Shared email rendering helpers: `amplify/functions/lead-followup-worker/email-rendering.ts`
- QUO SMS provider: `amplify/functions/_lead-platform/services/providers/quo/quo-provider.ts`

Delivery reliability:

- Before each external SMS/customer-email/lead-notification-email provider call, the worker
  saves that channel as `sending` under the active lease.
- If the provider call returns, the worker updates the channel to `sent` or
  `failed` with the provider message id or error.
- If the lease is lost or the Lambda stops after a provider call but before the
  final save, later workers see `sending`, avoid a duplicate provider call, and
  mark the work `error` with `delivery_attempt_unconfirmed` for operator repair.

### Follow-Up Operations

The admin API exposes an operational follow-up queue alongside lead records:

- `GET /admin/leads` includes non-completed `followup_work` rows for `queued`,
  `processing`, and `error` work.
- `POST /admin/leads/followup-work/retry` re-invokes `lead-followup-worker` by
  `idempotency_key` only when the record is not completed, is not actively
  leased, is not a fresh queued item, and does not have an unconfirmed `sending`
  delivery attempt.
- `POST /admin/leads/followup-work/manual` marks non-completed work as manually
  resolved without sending customer/provider messages.
- Lead-critical Lambda error and throttle alarms are defined in backend CDK
  wiring. They create CloudWatch alarms but do not attach notification actions
  until an alarm destination is configured.

### Summary generation (Responses.parse)

The shop notification email includes an internal AI summary generated from the transcript.

Implementation:

- `generateLeadSummary(...)` in `amplify/functions/chat-handoff-promote/lead-summary.ts`

Key properties:

- Uses `openai.responses.parse(...)` with `text.format = json_schema` (Structured Outputs).
- The schema is strict and disallows extra properties.
- The prompt explicitly instructs:
  - "Only use explicit information; do not guess"
  - no pricing, no invented shop policies
  - summary/next steps in English
  - outreach message in the customer's language

Model:

- Default `LEAD_SUMMARY_MODEL = gpt-5.4-2026-03-05`

You can change this via the function environment (deploy required).

## Build and deploy pipeline (Amplify)

Amplify builds run:

1) `npm ci`
2) `npm run predeploy`
3) `npx ampx pipeline-deploy ... --outputs-out-dir public`
4) `npm run build:release`

See `amplify.yml`.

The pipeline-deploy step is what makes `/amplify_outputs.json` correct for the
current branch environment.

## How to safely change X (backend)

### Change shop hours logic (agent must not guess)

1) Update schedule logic in:
   - `amplify/functions/chat-session-create/handler.ts`
   - `server/chatkit-dev.mjs`
2) Consider updating agent instructions to explicitly use `shop_*` state variables.
3) Deploy (commit + push).

### Change email recipient or sender

1) Update:
   - `amplify/functions/lead-followup-worker/resource.ts`
2) Verify sender identity in SES for the region.
3) Deploy.

### Change follow-up email template

1) Update the worker email adapters/content:
   - `amplify/functions/lead-followup-worker/customer-email.ts`
   - `amplify/functions/lead-followup-worker/lead-notification-email.ts`
   - `amplify/functions/lead-followup-worker/customer-followup-template.ts`
   - `amplify/functions/lead-followup-worker/lead-notification-template.ts`
   - `amplify/functions/lead-followup-worker/email-rendering.ts`
2) Keep HTML + text versions usable (shop staff may read either).
3) Deploy and test with a new lead source event (completed follow-up work blocks re-sends).

### Change idempotency timing (lease/ttl)

1) Update:
   - `LEAD_FOLLOWUP_LEASE_SECONDS` in `amplify/functions/lead-followup-worker/process-lead-followup-worker.ts`
   - `LEAD_FOLLOWUP_WORK_TTL_DAYS` in `amplify/functions/_lead-platform/domain/lead-followup-work.ts`
2) Deploy.
3) Validate:
   - duplicates do not occur
   - errors do not cause a retry storm

### Change chat lead-summary readiness

This is mostly controlled by the summary prompt + customer response policy rules.

1) Update the instructions inside `generateLeadSummary(...)` in `amplify/functions/chat-handoff-promote/lead-summary.ts`.
2) Deploy.
3) Test:
   - Contact is still required before capture.
   - Ready leads use `customer_response_policy = "automatic"`.
   - Ambiguous or incomplete-but-contactable leads use `customer_response_policy = "manual_review"`
     and send only the internal lead notification.

## Security and privacy notes (backend)

- The OpenAI API key is never sent to the browser.
- The ChatKit thread transcript may contain PII.
- Do not log full transcripts in CloudWatch.
- Treat emails as containing PII; restrict who has access to the inbox and logs.

For operational debugging and where to look when things fail, see:

- `docs/chatkit/runbook.md`
