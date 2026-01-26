# ChatKit lead intake (AWS Amplify Gen2 + OpenAI ChatKit + SES)

This repo implements a production lead-intake chat for Craig's Auto Upholstery.
Customers chat in the browser (ChatKit renders the UI). The site captures lead
details and automatically emails the shop a transcript + an internal AI summary.

This document is the "what exists and why" reference for future developers.

## Quickstart

Production (AWS Amplify):

1) OpenAI: create/edit the ChatKit workflow in Agent Builder and copy its workflow id (`wf_...`).
2) OpenAI: add your domains to the domain allowlist (at minimum: `chat.craigs.autos`).
3) AWS SES (same region as the Amplify backend): verify the sender identity (currently `victor@craigs.autos`).
4) AWS Amplify: set Secrets for the branch/environment:
   - `OPENAI_API_KEY`
   - `CHATKIT_WORKFLOW_ID`
5) Deploy by committing + pushing to the branch Amplify is connected to.

Local development:

1) Create `.env.local` at the repo root:
   - `OPENAI_API_KEY=...`
   - `CHATKIT_WORKFLOW_ID=...`
2) Install deps: `npm ci`
3) Run: `npm run dev:local`
4) Open: `http://localhost:4321/en/`

## Contents

- Goals
- High-level architecture
- Glossary
- OpenAI configuration
- AWS Amplify Gen2 backend
- AWS SES configuration
- Idempotency
- Frontend integration
- API reference
- Backend functions
- Local development
- Deployment notes
- Troubleshooting checklist
- Files quick reference
- Common maintenance tasks

## Goals

- Give customers a real chat experience (not a form).
- Support all locales on the site; assistant replies in the page language.
- Collect lead info (project details + customer contact) without quoting prices.
- Send an actionable email to the shop automatically, without asking customers to
  click an "end chat" button.
- Keep the OpenAI API key and workflow id off the frontend.
- Be robust against duplicate sends (multiple tabs/devices) and flaky browser events.

## High-level architecture

ChatKit is split into 3 major parts:

1) OpenAI-hosted ChatKit runtime + managed workflow (Agent Builder)
2) Frontend site that embeds ChatKit UI and requests a session
3) AWS backend that:
   - mints ephemeral ChatKit session secrets
   - fetches ChatKit transcripts by thread id
   - emails the shop via SES
   - enforces "send once per thread" with DynamoDB

Flow (simplified):

```
Customer browser
  -> (POST) chatkit-session Lambda URL  [server has OPENAI_API_KEY + CHATKIT_WORKFLOW_ID]
      -> OpenAI ChatKit sessions.create(...) -> returns client_secret
  -> ChatKit runtime talks to OpenAI using client_secret
  -> ChatKit creates/updates a thread (cthr_...)
  -> (POST) chatkit-lead-email Lambda URL (threadId=cthr_...)
      -> OpenAI threads.retrieve + threads.listItems -> transcript
      -> OpenAI Responses.parse -> internal summary/next steps/call script/outreach
      -> DynamoDB lease (idempotency) -> SES email -> DynamoDB mark sent
```

## Glossary

- Workflow id: `wf_...`
  - Configured in OpenAI Agent Builder. Stored as an Amplify Secret: `CHATKIT_WORKFLOW_ID`.
  - Changing the workflow in Agent Builder updates behavior immediately; no deploy needed.

- Session id: `cksess_...`
  - Short-lived ChatKit session created by the backend. Not used as a stable identifier.

- Thread id: `cthr_...`
  - The canonical "conversation id" in ChatKit. This is the stable identifier we use for:
    - emailing transcripts
    - idempotency ("send once per thread")
    - debugging via OpenAI logs

- Chat user id: `anon_...`
  - A stable per-browser string stored in localStorage. Used as `user` when creating sessions.
  - Tracks "same visitor" across sessions, but is not a conversation id.

## OpenAI configuration

### Managed workflow (Agent Builder)

This site uses a managed ChatKit workflow created in Agent Builder.
The workflow id (ex: `wf_69752536175881908c3737feebad29ee0584eae4531960aa`) is stored in Amplify as
`CHATKIT_WORKFLOW_ID` and passed into `openai.beta.chatkit.sessions.create(...)`.

The workflow receives state variables from the backend on session creation:

- `locale` (string)
- `page_url` (string)
- `shop_timezone` (string) default `America/Los_Angeles`
- `shop_local_weekday` (string) ex: `Sunday`
- `shop_local_time_24h` (string) ex: `16:05`
- `shop_is_open_now` (boolean)
- `shop_next_open_day` (string) ex: `Monday`
- `shop_next_open_time` (string) ex: `8:00 AM`

These are computed server-side so the agent can answer day/time/hours questions
without guessing.

### Domain allowlist

In production, ChatKit validates the hosting domain. Add domains in:

https://platform.openai.com/settings/organization/security/domain-allowlist

At minimum for this repo:

- `chat.craigs.autos`
- `craigs.autos` (if you embed chat on the main site)

Local development:

- ChatKit prints "Domain verification skipped for http://localhost:4321" (expected).
  You do not need to allowlist localhost for local dev.

## AWS Amplify Gen2 backend

The backend is defined in `amplify/backend.ts` and uses:

- AWS Lambda Function URLs for HTTPS endpoints
- AWS SES for delivery
- DynamoDB for idempotency (send once per `cthr_...`)

### Backend outputs (amplify_outputs.json)

Amplify generates `public/amplify_outputs.json` on build via `ampx pipeline-deploy`
(see `amplify.yml`). The frontend reads `custom.chatkit_session_url` and
`custom.chatkit_lead_email_url` from that file so we don't hardcode per-branch URLs.

Example keys:

- `custom.chatkit_session_url`
- `custom.chatkit_lead_email_url`

## AWS SES configuration

This system sends an internal email to the shop. SES must be configured in the
same region as the Amplify backend (currently `us-west-1`).

Requirements:

- Verify `victor@craigs.autos` (or a verified domain sender).
- Ensure SES is out of sandbox if you later send emails to arbitrary addresses.

Code:

- Sender/recipient defaults are set in `amplify/functions/chatkit-lead-email/resource.ts`:
  - `LEAD_TO_EMAIL` (default `victor@craigs.autos`)
  - `LEAD_FROM_EMAIL` (default `victor@craigs.autos`)

IAM:

- SES send permissions are granted in `amplify/backend.ts`:
  - `ses:SendEmail`
  - `ses:SendRawEmail`

## Idempotency

Why:

- The browser may trigger lead sends multiple times (idle timer, tab close, retries).
- Customers can have multiple tabs/devices.
- We need "one email per ChatKit thread" across all clients.

Implementation:

- DynamoDB table: `ChatkitLeadDedupeTable` in `amplify/backend.ts`
  - Partition key: `thread_id` (string) (the ChatKit `cthr_...`)
  - TTL attribute: `ttl` (seconds since epoch)
  - RemovalPolicy: `RETAIN` (safe for production)

- Environment variable injected into the Lambda:
  - `LEAD_DEDUPE_TABLE_NAME`

- Lambda logic in `amplify/functions/chatkit-lead-email/handler.ts`:
  - record states: `sending | sent | error`
  - lease fields:
    - `lease_id` (random UUID)
    - `lock_expires_at` (epoch seconds)
  - sent record fields:
    - `sent_at`
    - `message_id` (SES MessageId)
  - TTL defaults to 30 days

Semantics:

- If record is `sent`: return `{ sent: true, reason: "already_sent" }` immediately.
- If record is `sending` and lease not expired: return `{ sent: false, reason: "in_progress" }`.
- If record is `error` and cooldown not expired: return `{ sent: false, reason: "cooldown" }`.
- Otherwise acquire a lease and attempt to send.

This design prevents duplicates even if multiple clients hit the endpoint at once.

## Frontend integration

Primary files:

- `src/components/ChatWidgetReact.jsx` (ChatKit embed + triggers)
- `src/components/ChatWidget.astro` (Astro wrapper)
- `src/lib/site-data.js` (locale copy, including `CHAT_COPY`)

### ChatKit runtime loading

`@openai/chatkit-react` is a React wrapper around a web component (`<openai-chatkit>`),
but the runtime JS is loaded separately.

This repo loads the runtime from:

- `https://cdn.platform.openai.com/deployments/chatkit/chatkit.js`

Override hooks:

- `PUBLIC_CHATKIT_RUNTIME_URL`
- `PUBLIC_CHATKIT_RUNTIME_URLS` (comma-separated list)

### Session creation

ChatKit calls the app-supplied `getClientSecret(current)` function, implemented in
`src/components/ChatWidgetReact.jsx`.

It posts to the session endpoint with:

- `locale`
- `pageUrl` (current window URL)
- `user` (the stable `anon_...`)
- `current` (ChatKit internal)

The backend returns `{ client_secret }` only (no OpenAI key exposed).

### Thread persistence

- Thread id (`cthr_...`) is saved in `sessionStorage` (`THREAD_STORAGE_KEY`).
- User id (`anon_...`) is saved in `localStorage` (`USER_KEY`).

This means:

- A refresh restores the active thread for that browser session.
- A new browser session starts a new thread by default.

### Lead email triggers (no "end chat" required)

`src/components/ChatWidgetReact.jsx` sends a POST to the lead-email endpoint with:

- `threadId`
- `locale`
- `pageUrl`
- `user`
- `reason`

Triggers:

- `reason: "auto"` after each assistant response (`onResponseEnd`)
  - backend only sends when the conversation is "handoff_ready"
- `reason: "idle"` after 90s idle while chat is open
- `reason: "pagehide"` when the tab hides/unloads
- `reason: "chat_closed"` when the user closes the chat panel

Client-side dedupe:

- The frontend stores `chatkit-lead-sent:<threadId>=true` in localStorage once the
  backend returns `{ sent: true }`.
- This reduces unnecessary calls, but server-side DynamoDB is the true source of truth.

## API reference

This repo uses Lambda Function URLs (not API Gateway) and exposes 2 POST endpoints. In production,
their full URLs are written into `public/amplify_outputs.json` as:

- `custom.chatkit_session_url`
- `custom.chatkit_lead_email_url`

The frontend discovers them by fetching `/amplify_outputs.json` at runtime.

### POST session endpoint (create ChatKit session)

Used by ChatKit to mint an ephemeral `client_secret` (no OpenAI API key in the browser).

Request body (JSON):

```json
{
  "current": {},
  "locale": "en",
  "pageUrl": "https://chat.craigs.autos/en/",
  "user": "anon_..."
}
```

Response body (JSON):

```json
{
  "client_secret": "ckcs_..."
}
```

Notes:

- Implemented in `amplify/functions/chatkit-session/handler.ts`.
- Also injects shop-local time state variables into the workflow (see "OpenAI configuration").

### POST lead email endpoint (fetch transcript + email the shop)

Request body (JSON):

```json
{
  "threadId": "cthr_...",
  "locale": "en",
  "pageUrl": "https://chat.craigs.autos/en/",
  "user": "anon_...",
  "reason": "auto"
}
```

Response body (JSON):

```json
{
  "ok": true,
  "sent": true,
  "reason": "auto"
}
```

Other common responses:

- `{ ok: true, sent: false, reason: "missing_contact" }`
- `{ ok: true, sent: false, reason: "not_ready", missing_info: [...] }` (when `reason: "auto"`)
- `{ ok: true, sent: false, reason: "in_progress" }` (another device/tab is sending)
- `{ ok: true, sent: false, reason: "cooldown" }` (previous send errored; short cooldown)
- `{ ok: true, sent: true, reason: "already_sent", sent_at: 1234567890 }`

## Backend functions

### 1) ChatKit session minting

Files:

- `amplify/functions/chatkit-session/resource.ts`
- `amplify/functions/chatkit-session/handler.ts`

Endpoint:

- Lambda Function URL output as `custom.chatkit_session_url` in `amplify_outputs.json`

Key behavior:

- Computes shop-local time state (America/Los_Angeles) and passes it as workflow state variables.
- Calls:
  - `openai.beta.chatkit.sessions.create({ user, workflow: { id, state_variables } })`

### 2) Lead email processing + delivery

Files:

- `amplify/functions/chatkit-lead-email/resource.ts`
- `amplify/functions/chatkit-lead-email/handler.ts`

Endpoint:

- Lambda Function URL output as `custom.chatkit_lead_email_url` in `amplify_outputs.json`

Key behavior:

1) Validates input: must include a `cthr_...` thread id.
2) Dedupe fast path:
   - if already sent: return early without hitting OpenAI or SES
3) Fetches transcript:
   - `openai.beta.chatkit.threads.retrieve(threadId)`
   - `openai.beta.chatkit.threads.listItems(threadId, { order: "asc" })` (paged)
4) Extracts contact info from CUSTOMER messages only:
   - email regex
   - phone regex, excluding the shop phone number
5) Summarizes for the shop:
   - `openai.responses.parse(...)` (Structured Outputs)
   - Schema includes:
     - `handoff_ready` / `handoff_reason`
     - internal summary / next steps / follow-ups
     - `call_script_prompts` (3 prompts)
     - `customer_language` + `outreach_message` (one paragraph in that language)
6) Sends email via SES (HTML + text):
   - clickable phone/mail/thread links
   - quick action chips (tel/sms/mail/open page/open logs)
   - copy/paste drafts
   - call script
7) Marks sent in DynamoDB (or error cooldown)

Send gating:

- For `reason: "auto"` (after assistant response), we only send when
  `handoff_ready === true` to avoid emailing the shop too early.
- For non-auto reasons (`idle`, `pagehide`, `chat_closed`), we send once contact
  info exists to catch abandoned leads.

## Local development

### Prereqs

- Node (the repo uses modern Node; Amplify builds run Node 25 currently)
- `npm ci` (avoid `sudo`; if permissions are broken, fix ownership of `node_modules`)

### Dev env file

Create `.env.local` at the repo root (do not commit):

```
OPENAI_API_KEY=sk-...
CHATKIT_WORKFLOW_ID=wf_...
```

### Run

This starts the Astro dev server + a small local API that mimics the Amplify endpoints:

```
npm run dev:local
```

URLs:

- Site: `http://localhost:4321/en/`
- Dev API: `http://localhost:8787/api/chatkit/session`

Note:

- The local dev lead endpoint is a noop (`/api/chatkit/lead`) so you can test the UI without SES.

## Deployment notes

- Code changes require commit + push to the branch that Amplify is connected to.
- Workflow changes in Agent Builder apply immediately (same `wf_...`), no code deploy.

## Troubleshooting checklist

### Chat shows no input box / looks blank

Common causes:

- ChatKit runtime failed to load (CDN blocked or wrong URL).
- ChatKit initialized inside a hidden container (ChatKit may mis-measure and render wrong).

This repo mitigates hidden init by only mounting ChatKit when the panel is open.

### CORS errors

- Function URL CORS is configured in `amplify/backend.ts` for:
  - `https://chat.craigs.autos`
  - `https://craigs.autos`
  - `http://localhost:4321`

### Domain allowlist errors

- Add domains at:
  https://platform.openai.com/settings/organization/security/domain-allowlist

### SES send failures

- Sender not verified
- SES sandbox restrictions
- Wrong region

### Duplicate emails

- Check DynamoDB `ChatkitLeadDedupeTable` records for the thread id.
- Idempotency is keyed on `cthr_...` and should prevent duplicates across devices.

## Files quick reference

- Frontend widget: `src/components/ChatWidgetReact.jsx`
- Widget wrapper: `src/components/ChatWidget.astro`
- UI copy (per locale): `src/lib/site-data.js` (`CHAT_COPY`)
- Dev API for local work: `server/chatkit-dev.mjs`
- Amplify backend: `amplify/backend.ts`
- Session minting Lambda: `amplify/functions/chatkit-session/handler.ts`
- Lead email Lambda: `amplify/functions/chatkit-lead-email/handler.ts`

## Common maintenance tasks

### Change the agent behavior (no deploy needed)

Edit the managed workflow in Agent Builder. The site references it by workflow id (`wf_...`), so prompt
and guardrail changes apply immediately.

Important:

- If you set the Agent block output format to JSON, the customer will see `{}` instead of normal chat.

### Change UI copy / prompts per locale

Update `CHAT_COPY` in `src/lib/site-data.js`.

### Change email recipient/sender (deploy needed)

Update defaults in `amplify/functions/chatkit-lead-email/resource.ts`:

- `LEAD_TO_EMAIL`
- `LEAD_FROM_EMAIL`
- `LEAD_SUMMARY_MODEL`

Then commit + push so Amplify redeploys.

### Update the email template (deploy needed)

Email HTML/text is assembled in `amplify/functions/chatkit-lead-email/handler.ts` inside
`sendTranscriptEmail(...)`.

### Re-send an email for a thread (idempotency is enabled)

Idempotency is keyed on the ChatKit thread id (`cthr_...`). To force a re-send you must either:

1) Start a new chat thread (creates a new `cthr_...`), or
2) Delete the item for that `thread_id` from the DynamoDB table `ChatkitLeadDedupeTable`.

### Find the thread id for debugging

Options:

- From the email subject (it includes `(cthr_...)`).
- From OpenAI logs: `https://platform.openai.com/logs/cthr_...`
- From the browser session storage key `chatkit-thread-id`.
