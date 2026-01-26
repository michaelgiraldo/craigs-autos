# ChatKit lead intake - backend (AWS Amplify Gen2)

This document describes the AWS backend for ChatKit lead intake:

- How sessions are minted (ephemeral client secrets)
- How transcripts are fetched and emailed
- How idempotency is enforced (send once per ChatKit thread id)

Related docs:

- Overview: `docs/chatkit/overview.md`
- Frontend: `docs/chatkit/frontend.md`
- Agent Builder: `docs/chatkit/agent-builder.md`
- Runbook: `docs/chatkit/runbook.md`

## Key files

- `amplify/backend.ts`
  - Defines the Amplify Gen2 backend via CDK:
    - Lambda functions
    - Lambda Function URLs
    - CORS configuration
    - SES IAM permissions
    - DynamoDB idempotency table
    - Build outputs (`custom.chatkit_*_url`)

- Session minting function:
  - `amplify/functions/chatkit-session/resource.ts`
  - `amplify/functions/chatkit-session/handler.ts`

- Lead email function:
  - `amplify/functions/chatkit-lead-email/resource.ts`
  - `amplify/functions/chatkit-lead-email/handler.ts`

Build/deploy pipeline:

- `amplify.yml` (runs `ampx pipeline-deploy` to generate `public/amplify_outputs.json`)

## Secrets and environment variables

### Amplify Secrets (required)

These must be set per Amplify environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`

They are referenced in code via Amplify's `secret(...)`:

- `amplify/functions/chatkit-session/resource.ts`
- `amplify/functions/chatkit-lead-email/resource.ts`

### Function environment variables (defaults)

Lead email defaults (can be overridden later):

- `LEAD_TO_EMAIL` (default: `victor@craigs.autos`)
- `LEAD_FROM_EMAIL` (default: `victor@craigs.autos`)
- `LEAD_SUMMARY_MODEL` (default: `gpt-5.2-2025-12-11`)

Idempotency wiring (injected by `amplify/backend.ts`):

- `LEAD_DEDUPE_TABLE_NAME`

## Endpoints and discovery

The backend uses Lambda Function URLs, not API Gateway.

Two Function URLs are created in `amplify/backend.ts`:

- Session URL (`chatkit-session`)
- Lead email URL (`chatkit-lead-email`)

During Amplify builds, `ampx pipeline-deploy` writes `public/amplify_outputs.json`.
The frontend fetches `/amplify_outputs.json` and reads:

- `custom.chatkit_session_url`
- `custom.chatkit_lead_email_url`

This avoids hardcoding per-branch function URLs.

## CORS

CORS is configured on the Function URLs in `amplify/backend.ts`.

Allowed origins currently include:

- `https://chat.craigs.autos`
- `https://craigs.autos`
- `http://localhost:4321`

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

## Lead email function (chatkit-lead-email)

Purpose:

- Given a ChatKit thread id (`cthr_...`), fetch the transcript
- Extract actionable contact info
- Generate internal helper content (summary/next steps/call script/outreach)
- Email the shop via SES
- Enforce send-once behavior with DynamoDB

Implementation:

- `amplify/functions/chatkit-lead-email/handler.ts`

### Processing pipeline (high level)

1) Validate input (must include a valid `cthr_...`)
2) Dedupe fast path:
   - If DynamoDB says "already sent", return immediately
3) Fetch transcript from OpenAI:
   - `openai.beta.chatkit.threads.retrieve(threadId)`
   - `openai.beta.chatkit.threads.listItems(threadId, { order: "asc" })` (paged)
4) Convert ChatKit items into normalized transcript lines:
   - "Customer" lines from `chatkit.user_message`
   - "Roxana" lines from `chatkit.assistant_message`
   - attachments included as text lines (name/mime/preview_url)
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
7) Decide whether to send now:
   - `reason: "auto"` only sends when `handoff_ready === true`
   - other reasons send once contact exists (to catch abandoned chats)
8) Acquire send lease in DynamoDB (threadId-keyed)
9) Send email via SES (HTML + text)
10) Mark DynamoDB record as `sent` (or `error` with cooldown)

### Idempotency: DynamoDB lease model

Idempotency is required because the frontend can call the lead-email endpoint
multiple times:

- after every assistant response
- after idle
- on tab hide/unload
- on manual close

Also: users can open multiple tabs/devices.

Design:

- DynamoDB table: `ChatkitLeadDedupeTable`
  - partition key: `thread_id` (string)
  - TTL attribute: `ttl`
  - removal policy: RETAIN (safe for production)

Record states:

- `sending` (lease acquired; a send is in progress)
- `sent` (email successfully sent)
- `error` (send failed; short cooldown to avoid retry storms)

Key fields stored:

- `thread_id`
- `status`
- `lease_id`
- `lock_expires_at`
- `sent_at`
- `message_id` (SES MessageId)
- `attempts`
- `last_error`
- `ttl` (for automatic cleanup)

Semantics:

- If record is `sent`: endpoint returns `{ sent: true, reason: "already_sent" }` without reprocessing.
- If record is `sending` and lease not expired: endpoint returns `{ sent: false, reason: "in_progress" }`.
- If record is `error` and cooldown not expired: endpoint returns `{ sent: false, reason: "cooldown" }`.
- Otherwise: acquire lease, send, mark sent or mark error.

Lease/cooldown tuning constants live in `amplify/functions/chatkit-lead-email/handler.ts`:

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

- `sendTranscriptEmail(...)` in `amplify/functions/chatkit-lead-email/handler.ts`

It produces:

- plain text part
- HTML part with:
  - clickable phone/email/thread links
  - quick-action chips (tel/sms/mail/open page/open logs)
  - call script prompts
  - copy/paste drafts (SMS, email subject/body, suggested outreach)
  - transcript

If you modify the email template, keep both HTML and text in sync.

### Summary generation (Responses.parse)

The lead email includes an internal AI summary generated from the transcript.

Implementation:

- `generateLeadSummary(...)` in `amplify/functions/chatkit-lead-email/handler.ts`

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
2) `npx ampx pipeline-deploy ... --outputs-out-dir public`
3) `npm run build`

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
   - `amplify/functions/chatkit-lead-email/resource.ts`
2) Verify sender identity in SES for the region.
3) Deploy.

### Change email template

1) Update `sendTranscriptEmail(...)` in `amplify/functions/chatkit-lead-email/handler.ts`.
2) Keep HTML + text versions usable (shop staff may read either).
3) Deploy and test by starting a new thread (idempotency blocks re-sends).

### Change idempotency timing (lease/cooldown/ttl)

1) Update constants in `amplify/functions/chatkit-lead-email/handler.ts`.
2) Deploy.
3) Validate:
   - duplicates do not occur
   - errors do not cause a retry storm

### Change what "handoff_ready" means

This is mostly controlled by the summary prompt + schema rules.

1) Update the instructions inside `generateLeadSummary(...)`.
2) Deploy.
3) Test:
   - Early messages should not email the shop on `reason: "auto"`.
   - Once contact + project exists, it should email.

## Security and privacy notes (backend)

- The OpenAI API key is never sent to the browser.
- The ChatKit thread transcript may contain PII.
- Do not log full transcripts in CloudWatch.
- Treat emails as containing PII; restrict who has access to the inbox and logs.

For operational debugging and where to look when things fail, see:

- `docs/chatkit/runbook.md`
