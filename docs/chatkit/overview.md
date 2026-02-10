# ChatKit lead intake - overview

This repo runs a production lead-intake chat for Craig's Auto Upholstery.
Customers chat on the website. The shop receives an email containing:

- The full chat transcript
- An internal AI summary (for shop staff)
- Suggested next steps + follow-up questions
- A 3-prompt call script
- A suggested outreach message in the customer's language

The Chat UI is rendered by OpenAI ChatKit in the browser. The AWS backend mints
ephemeral session secrets (so the OpenAI API key never ships to the browser),
and sends the lead email via AWS SES.

## Start here

- Agent Builder (workflow/prompt/guardrails): `docs/chatkit/agent-builder.md`
- Frontend widget (Astro + React + ChatKit): `docs/chatkit/frontend.md`
- Backend (Amplify Gen2 + Lambda + SES + DynamoDB): `docs/chatkit/backend.md`
- Operations runbook (debugging + production issues): `docs/chatkit/runbook.md`

If you are new to the codebase, read this file first, then `backend.md` and
`frontend.md`.

## Goals and non-goals

Goals:

- Make the chat feel like a real conversation (not a form).
- Support all locales on the site; assistant replies in the page language.
- Capture enough lead details for a real follow-up (project + contact).
- Never provide prices or quote ranges in chat.
- Email the shop without requiring customers to click "end chat".
- Be reliable: avoid duplicate emails, and catch abandoned chats.
- Keep secrets server-side (OpenAI key, workflow id).

Non-goals (current scope):

- Booking appointments directly (chat collects info; shop schedules).
- Integrating with a CRM (email is the handoff; can be added later).
- Rebuilding Chat UI (we intentionally rely on ChatKit UI).

## How ChatKit works in this repo (mental model)

ChatKit has three core pieces:

1) A managed workflow in OpenAI Agent Builder (the "agent brain")
2) A browser UI runtime (the ChatKit web component + React bindings)
3) Your backend endpoints (mint sessions, do server-side actions like emailing)

ChatKit conversations are stored by OpenAI as threads.

Important: the thread id (`cthr_...`) is the canonical conversation id. Treat it
as your system-of-record key for everything downstream (email, dedupe, debug).

## Identifiers (use the right one)

- Workflow id: `wf_...`
  - Created in Agent Builder.
  - Stored in AWS Amplify Secrets as `CHATKIT_WORKFLOW_ID`.
  - Changing the workflow in Agent Builder applies immediately (no deploy).

- Session id: `cksess_...`
  - Created by the backend, short-lived.
  - Used only to mint a `client_secret` for ChatKit runtime calls.

- Thread id: `cthr_...`
  - Created by ChatKit as the user chats.
  - Canonical conversation id for:
    - fetching transcript
    - idempotency ("send once")
    - debugging (OpenAI logs link)

- User id: `anon_...`
  - Stable per-browser id stored in localStorage.
  - Passed as `user` when creating sessions.
  - Represents "who is chatting" across sessions in the same browser, not a thread.

## System architecture (high-level)

```
Browser (chat.craigs.autos)
  - ChatKit runtime renders UI
  - Requests a client_secret from our backend
  - Calls our lead-email endpoint with threadId (cthr_...)

AWS Amplify Gen2 backend
  - Lambda Function URL: chatkit-session
      - calls OpenAI: chatkit.sessions.create
      - returns client_secret
  - Lambda Function URL: chatkit-lead-email
      - calls OpenAI: chatkit.threads.retrieve + listItems
      - generates internal summary (Responses.parse)
      - sends email via SES
      - uses DynamoDB for idempotency per threadId

OpenAI
  - Managed workflow (Agent Builder)
  - Stores ChatKit threads and logs
```

## Sequence diagram: session minting

This is the request that happens when the chat UI needs an ephemeral secret.

```
Browser              chatkit-session Lambda             OpenAI ChatKit
  |                         |                              |
  | POST /session           |                              |
  | { locale, user, ... }   |                              |
  |------------------------>|                              |
  |                         | sessions.create(workflow wf) |
  |                         |----------------------------->|
  |                         | { client_secret }            |
  |                         |<-----------------------------|
  | { client_secret }       |                              |
  |<------------------------|                              |
  | ChatKit runtime uses client_secret for chat requests    |
```

Notes:

- The backend also injects server-computed shop time state variables so the agent
  can answer "what day is it / are you open" without guessing.

## Sequence diagram: lead email send + idempotency

The lead-email endpoint may be called multiple times (idle/pagehide/close).
Server-side DynamoDB enforces "send once per thread".

```
Browser            chatkit-lead-email Lambda        DynamoDB             SES         OpenAI ChatKit
  |                        |                        |                   |               |
  | POST /lead             |                        |                   |               |
  | { threadId, reason }   |                        |                   |               |
  |----------------------->|                        |                   |               |
  |                        | Get(threadId)          |                   |               |
  |                        |----------------------->|                   |               |
  |                        | status? (sent/sending) |                   |               |
  |                        |<-----------------------|                   |               |
  |                        | if already sent -> 200 |                   |               |
  |                        | else acquire lease     |                   |               |
  |                        | Update(threadId, lease)|                   |               |
  |                        |----------------------->|                   |               |
  |                        | ok                     |                   |               |
  |                        |<-----------------------|                   |               |
  |                        | threads.listItems      |                   |               |
  |                        |-------------------------------------------->|               |
  |                        | transcript + metadata  |                   |               |
  |                        |<--------------------------------------------|               |
  |                        | Responses.parse(summary schema)             |               |
  |                        |-------------------------------------------->|               |
  |                        | summary json                                 |               |
  |                        |<--------------------------------------------|               |
  |                        | SES SendEmail                                |               |
  |                        |------------------------------->|            |               |
  |                        | MessageId                     |            |               |
  |                        |<------------------------------|            |               |
  |                        | Update(threadId = sent)       |            |               |
  |                        |----------------------->|                   |               |
  | 200 { sent: true }     |                        |                   |               |
  |<-----------------------|                        |                   |               |
```

## Where to make changes (rule of thumb)

- Chat behavior (tone, language behavior, questions):
  - Change in Agent Builder (no deploy).

- UI copy (start prompt buttons, placeholder, error text) per locale:
  - Change in `src/lib/site-data.js` (`CHAT_COPY`) (deploy needed).

- Backend behavior (idempotency, email template, triggers semantics, CORS):
  - Change in Amplify backend code (deploy needed).

## Debugging shortcut

Always start by getting the thread id (`cthr_...`). Once you have it:

- OpenAI logs: `https://platform.openai.com/logs/cthr_...`
- Dedupe record: DynamoDB item keyed by `thread_id = cthr_...`
- Lead email body includes `Thread: cthr_...` in Diagnostics

For step-by-step debugging, see `docs/chatkit/runbook.md`.
