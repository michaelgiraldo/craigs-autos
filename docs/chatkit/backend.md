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
    - Quote submission queue table
    - Build outputs (`custom.api_base_url`)

- Session minting function:
  - `amplify/functions/chatkit-session/resource.ts`
  - `amplify/functions/chatkit-session/handler.ts`

- Chat lead handoff function:
  - `amplify/functions/chat-lead-handoff/resource.ts`
  - `amplify/functions/chat-lead-handoff/handler.ts`
  - `amplify/functions/chat-lead-handoff/email-delivery.ts`
  - `amplify/functions/chat-lead-handoff/lead-summary.ts`
  - `amplify/functions/chat-lead-handoff/transcript.ts`

- Message link resolver function:
  - `amplify/functions/chatkit-message-link/resource.ts`
  - `amplify/functions/chatkit-message-link/handler.ts`

Build/deploy pipeline:

- `amplify.yml` (runs `ampx pipeline-deploy` to generate `public/amplify_outputs.json`)

## Secrets and environment variables

### Amplify Secrets (required)

These must be set per Amplify environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`

They are referenced in code via Amplify's `secret(...)`:

- `amplify/functions/chatkit-session/resource.ts`
- `amplify/functions/chat-lead-handoff/resource.ts`

### Function environment variables (defaults)

Shop notification email defaults (can be overridden later):

- `LEAD_TO_EMAIL` (default: `leads@craigs.autos`)
- `LEAD_FROM_EMAIL` (default: `leads@craigs.autos`)
- `LEAD_SUMMARY_MODEL` (default: `gpt-5.2-2025-12-11`)

Idempotency wiring (injected by `amplify/backend.ts`):

- `LEAD_DEDUPE_TABLE_NAME`
- `MESSAGE_LINK_TOKEN_TABLE_NAME` (for both `chatkit-message-link` and `chat-lead-handoff`)

Journey-first lead wiring (injected by `amplify/backend.ts`):

- `LEAD_CONTACTS_TABLE_NAME`
- `LEAD_JOURNEYS_TABLE_NAME`
- `LEAD_JOURNEY_EVENTS_TABLE_NAME`
- `LEAD_RECORDS_TABLE_NAME`
- `LEAD_ACTION_TOKENS_TABLE_NAME`

Lifecycle rules:

- Event lifecycle rules live in `amplify/functions/_lead-core/domain/lead-lifecycle.ts`.
- Event classification details live in `amplify/functions/_lead-core/domain/lead-semantics.ts`.
- The active lifecycle refactor plan and edge-case matrix live in `docs/lead-platform-lifecycle-plan-2026-04-18.md`.
- Meaningful visitor actions should append journey events; only quote submit success and completed chat handoff currently promote a journey to a lead record.

Quote form wiring (injected by `amplify/backend.ts`):

- `QUOTE_SUBMISSIONS_TABLE_NAME`
- `QUOTE_FOLLOWUP_FUNCTION_NAME`

Quote request domain code:

- Quote request record types and default state live in `amplify/functions/_lead-core/domain/quote-request.ts`.
- Quote request journey persistence and follow-up-to-lead sync live in `amplify/functions/_lead-core/services/quote-request.ts`.
- Contact submit HTTP response mapping lives in `amplify/functions/contact-submit/handler.ts`.
- Contact submit request parsing, validation, quote-submit orchestration, and AWS runtime wiring live in separate files under `amplify/functions/contact-submit/`.
- Quote follow-up HTTP response mapping lives in `amplify/functions/quote-followup/handler.ts`.
- Quote follow-up orchestration, state transitions, DynamoDB storage, SES delivery, QUO SMS, lead sync, and AWS/OpenAI runtime wiring live in separate files under `amplify/functions/quote-followup/`.
- Public submit handlers and async workers should call the lead-core service instead of keeping separate worker-local lead sync logic.

## Endpoints and discovery

The backend exposes one public HTTP API and routes stable paths to Lambdas.

Routes are defined in `amplify/backend/public-api.ts`:

- `POST /contact` -> `contact-submit`
- `POST /chat/session` -> `chatkit-session`
- `POST /chat/handoff` -> `chat-lead-handoff`
- `GET /chat/message-link` -> `chatkit-message-link`
- `POST /lead-signal` -> `chatkit-lead-signal`
- `GET|POST /admin/leads` -> `lead-admin`

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

## Session minting function (chatkit-session)

Purpose:

- Keep OpenAI secrets server-side
- Create a ChatKit session and return a short-lived `client_secret` to the browser

Implementation:

- `amplify/functions/chatkit-session/handler.ts`

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
  - `amplify/functions/chatkit-session/handler.ts`
  - `server/chatkit-dev.mjs` (local dev mirror)

## Chat lead handoff function (chat-lead-handoff)

Purpose:

- Given a ChatKit thread id (`cthr_...`), fetch the transcript
- Extract actionable contact info
- Generate internal helper content (summary/next steps/call script/outreach)
- Persist the captured lead journey
- Send the shop notification email via SES and QUO SMS when configured
- Enforce complete-once behavior with DynamoDB

Implementation:

- `amplify/functions/chat-lead-handoff/handler.ts`

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
   - phone regex (excluding the shop phone digits `4083793820`)
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
     snapshot the thread mid-conversation (see `docs/chatkit/chat-lead-handoff-before-after.md`).
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

- DynamoDB table: `ChatLeadHandoffDedupeTable`
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

Lease/cooldown tuning constants live in `amplify/functions/chat-lead-handoff/handler.ts`:

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

- `sendTranscriptEmail(...)` in `amplify/functions/chat-lead-handoff/email-delivery.ts`

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

- `generateLeadSummary(...)` in `amplify/functions/chat-lead-handoff/lead-summary.ts`

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
   - `amplify/functions/chatkit-session/handler.ts`
   - `server/chatkit-dev.mjs`
2) Consider updating agent instructions to explicitly use `shop_*` state variables.
3) Deploy (commit + push).

### Change email recipient or sender

1) Update:
   - `amplify/functions/chat-lead-handoff/resource.ts`
2) Verify sender identity in SES for the region.
3) Deploy.

### Change email template

1) Update `sendTranscriptEmail(...)` in `amplify/functions/chat-lead-handoff/email-delivery.ts`.
2) Keep HTML + text versions usable (shop staff may read either).
3) Deploy and test by starting a new thread (idempotency blocks re-sends).

### Change idempotency timing (lease/cooldown/ttl)

1) Update constants in `amplify/functions/chat-lead-handoff/handler.ts`.
2) Deploy.
3) Validate:
   - duplicates do not occur
   - errors do not cause a retry storm

### Change what "handoff_ready" means

This is mostly controlled by the summary prompt + schema rules.

1) Update the instructions inside `generateLeadSummary(...)` in `amplify/functions/chat-lead-handoff/lead-summary.ts`.
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
