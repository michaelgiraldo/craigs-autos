# ChatKit lead intake - backend (AWS Amplify Gen2)

This document describes the AWS backend for ChatKit lead intake:

- How sessions are minted (ephemeral client secrets)
- How transcripts are fetched, evaluated, and handed off to the shop
- How idempotency is enforced (complete once per ChatKit thread id)

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
    - SES IAM permissions
    - DynamoDB idempotency table
    - Journey-first lead tables
    - `QuoteRequests` queue table
    - Build outputs (`custom.api_base_url`)

- Session minting function:
  - `amplify/functions/chat-session-create/resource.ts`
  - `amplify/functions/chat-session-create/handler.ts`

- Chat lead handoff function:
  - `amplify/functions/chat-handoff-promote/resource.ts`
  - `amplify/functions/chat-handoff-promote/handler.ts`
  - `amplify/functions/chat-handoff-promote/email-delivery.ts`
  - `amplify/functions/chat-handoff-promote/lead-summary.ts`
  - `amplify/functions/chat-handoff-promote/transcript.ts`

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

Shop notification email defaults (can be overridden later):

- `LEAD_TO_EMAIL` (default from `packages/business-profile/src/business-profile.js`)
- `LEAD_FROM_EMAIL` (default from `packages/business-profile/src/business-profile.js`)
- `LEAD_SUMMARY_MODEL` (default: `gpt-5.2-2025-12-11`)
- `MANAGED_CONVERSION_DESTINATIONS` (optional comma-separated managed-conversion destination keys)

Idempotency wiring (injected by `amplify/backend.ts`):

- `LEAD_DEDUPE_TABLE_NAME`
- `LEAD_ACTION_LINKS_TABLE_NAME` (for both `lead-action-link-resolve` and `chat-handoff-promote`)

Journey-first lead wiring (injected by `amplify/backend.ts`):

- `LEAD_CONTACTS_TABLE_NAME`
- `LEAD_JOURNEYS_TABLE_NAME`
- `LEAD_JOURNEY_EVENTS_TABLE_NAME`
- `LEAD_RECORDS_TABLE_NAME`
- `LEAD_CONVERSION_DECISIONS_TABLE_NAME`
- `LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME`
- `LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME`
- `PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME`
- `LEAD_ACTION_LINKS_TABLE_NAME`

Managed-conversion worker defaults:

- `MANAGED_CONVERSION_FEEDBACK_BATCH_SIZE` (default `10`)
- `MANAGED_CONVERSION_FEEDBACK_LEASE_SECONDS` (default `300`)
- `MANAGED_CONVERSION_FEEDBACK_MAX_ATTEMPTS` (default `3`)
- `GOOGLE_ADS_CONVERSION_FEEDBACK_MODE` (default `dry_run`; supported modes: `disabled`, `dry_run`, `test`/`validate_only`, `live`)
- `GOOGLE_ADS_API_VERSION` (default `v22`)
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

The scheduled worker lives in `amplify/functions/managed-conversion-feedback-worker/`.
It currently ships with a provider adapter registry under
`amplify/functions/_lead-platform/services/conversion-feedback/`. The registry includes manual
export, Google Ads, and Yelp Ads adapters. `dry_run` builds and validates payloads locally without a
provider call. `test` calls the provider validation mode when available: Google Ads uses
`validateOnly`, and Yelp uses `test_event`. `live` sends real conversion feedback and records the
provider outcome.

Lifecycle rules:

- Canonical lead event names and their lifecycle/dataLayer/browser interaction contract
  live in `packages/contracts/src/lead-event-contract.js`.
- Event lifecycle rules live in `amplify/functions/_lead-platform/domain/lead-lifecycle.ts`.
- Event classification details live in `amplify/functions/_lead-platform/domain/lead-semantics.ts`.
- `lead-lifecycle.ts` and `lead-semantics.ts` must derive from the shared contract;
  they should not become separate event vocabularies.
- The active lifecycle refactor plan and edge-case matrix live in `docs/lead-platform-lifecycle-plan-2026-04-18.md`.
- Meaningful visitor actions should append journey events; only quote submit success and completed chat handoff currently promote a journey to a lead record.

Quote form wiring (injected by `amplify/backend.ts`):

- `QUOTE_REQUESTS_TABLE_NAME`
- `LEAD_FOLLOWUP_WORKER_FUNCTION_NAME`

Quote request domain code:

- Quote request record types and default state live in `amplify/functions/_lead-platform/domain/quote-request.ts`.
- Quote request journey persistence and follow-up-to-lead sync live in `amplify/functions/_lead-platform/services/quote-request.ts`.
- Quote request HTTP response mapping lives in `amplify/functions/quote-request-submit/handler.ts`.
- Quote request parsing, validation, submit orchestration, and AWS runtime wiring live in separate files under `amplify/functions/quote-request-submit/`.
- Quote follow-up HTTP response mapping lives in `amplify/functions/lead-followup-worker/handler.ts`.
- Quote follow-up orchestration, state transitions, DynamoDB storage, SES delivery, QUO SMS, lead sync, and AWS/OpenAI runtime wiring live in separate files under `amplify/functions/lead-followup-worker/`.
- Public submit handlers and async workers should call the lead-core service instead of keeping separate worker-local lead sync logic.

Shared backend utilities:

- Generic text/URL/email/phone helpers live in `amplify/functions/_shared/text-utils.ts`.
- The QUO API client lives in `amplify/functions/_shared/quo-client.ts`.
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
- Send the shop notification email via SES and QUO SMS when configured
- Enforce complete-once behavior with DynamoDB

Implementation:

- `amplify/functions/chat-handoff-promote/handler.ts`

### Processing pipeline (high level)

1) Validate input (must include a valid `cthr_...`)
2) Dedupe fast path:
   - If DynamoDB says "already completed", return immediately
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
     - readiness: `handoff_ready` + `handoff_reason`
     - summary and lists
     - call script prompts (3)
     - customer language + outreach message in that language
7) Decide whether to complete the handoff now:
   - Current triggers (`idle`, `pagehide`, `chat_closed`) attempt handoff once contact exists.
   - We intentionally avoid "handoff after every assistant response" because it can
     snapshot the thread mid-conversation (see `docs/chatkit/chat-handoff-promote-before-after.md`).
   - Final completion gate is `handoff_ready` from the summary model.
8) Acquire handoff lease in DynamoDB (threadId-keyed)
9) Run handoff side effects:
   - QUO SMS when enabled/configured
   - multipart MIME shop email via SES (plain text + HTML + optional inline images)
   - journey-first lead persistence
10) Mark DynamoDB record as `completed` (or `error` with cooldown)

### Idempotency: DynamoDB lease model

Idempotency is required because the frontend can call the chat lead handoff endpoint
multiple times:

- after idle
- on tab hide/unload
- on manual close

Also: users can open multiple tabs/devices.

Design:

- DynamoDB table: `ChatHandoffPromoteDedupeTable`
  - partition key: `thread_id` (string)
  - TTL attribute: `ttl`
  - removal policy: RETAIN (safe for production)

Record states:

- `processing` (lease acquired; a handoff is in progress)
- `completed` (handoff side effects completed)
- `error` (handoff failed; short cooldown to avoid retry storms)

Key fields stored:

- `thread_id`
- `status`
- `lease_id`
- `lock_expires_at`
- `completed_at`
- `email_sent_at`
- `email_message_id` (SES MessageId)
- `quo_sent_at`
- `quo_message_id`
- `attempts`
- `last_error`
- `ttl` (for automatic cleanup)

Semantics:

- If record is `completed`: endpoint returns `{ completed: true, reason: "already_completed" }` without reprocessing.
- If record is `processing` and lease not expired: endpoint returns `{ completed: false, reason: "in_progress" }`.
- If record is `error` and cooldown not expired: endpoint returns `{ completed: false, reason: "cooldown" }`.
- Otherwise: acquire lease, run handoff, mark completed or mark error.

Lease/cooldown tuning constants live in `amplify/functions/chat-handoff-promote/handler.ts`:

- `LEAD_DEDUPE_LEASE_SECONDS`
- `LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS`
- `LEAD_DEDUPE_TTL_DAYS`

### SES email sending

SES is used for email delivery.

Permissions:

- `ses:SendEmail`
- `ses:SendRawEmail`

are granted in `amplify/backend.ts`.

Email template assembly:

- `sendTranscriptEmail(...)` in `amplify/functions/chat-handoff-promote/email-delivery.ts`

It produces:

- plain text part
- HTML part with:
  - clickable phone/email/thread links
  - quick-action chips (tel/sms/mail/open page/open logs)
  - call script prompts
  - copy/paste drafts (SMS, email subject/body, suggested outreach)
  - transcript
- optional inline photos rendered with `Content-ID` CID references when attachments are
  small image previews from attachment storage

If you modify the email template, keep both HTML and text in sync.

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

- Default `LEAD_SUMMARY_MODEL = gpt-5.2-2025-12-11`

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
   - `amplify/functions/chat-handoff-promote/resource.ts`
2) Verify sender identity in SES for the region.
3) Deploy.

### Change email template

1) Update `sendTranscriptEmail(...)` in `amplify/functions/chat-handoff-promote/email-delivery.ts`.
2) Keep HTML + text versions usable (shop staff may read either).
3) Deploy and test by starting a new thread (idempotency blocks re-sends).

### Change idempotency timing (lease/cooldown/ttl)

1) Update constants in `amplify/functions/chat-handoff-promote/handler.ts`.
2) Deploy.
3) Validate:
   - duplicates do not occur
   - errors do not cause a retry storm

### Change what "handoff_ready" means

This is mostly controlled by the summary prompt + schema rules.

1) Update the instructions inside `generateLeadSummary(...)` in `amplify/functions/chat-handoff-promote/lead-summary.ts`.
2) Deploy.
3) Test:
   - The summary should only mark `handoff_ready = true` when contact + project is present.
   - If you later add a server-side "idle readiness gate", use `handoff_ready` (or a
     stricter checklist) to avoid emailing incomplete leads.

## Security and privacy notes (backend)

- The OpenAI API key is never sent to the browser.
- The ChatKit thread transcript may contain PII.
- Do not log full transcripts in CloudWatch.
- Treat emails as containing PII; restrict who has access to the inbox and logs.

For operational debugging and where to look when things fail, see:

- `docs/chatkit/runbook.md`
