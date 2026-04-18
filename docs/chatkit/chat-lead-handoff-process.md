# Craig’s Auto Upholstery Chat Lead Handoff Process

This document captures the current lead handoff design for chat leads and is meant to
be maintained as the process evolves.  
The file is intentionally not date-stamped so it remains the single source of truth.

Scope:

- Chat frontend trigger behavior
- Backend readiness checks and idempotency
- How attachments/photos are attached to lead notification emails
- How this supports the owner workflow (single high-quality handoff with email/QUO side effects)

## AWS components and purpose

- `amplify/functions/chatkit-session` (Lambda): creates short-lived OpenAI session secrets for the browser.
- `amplify/functions/chat-lead-handoff` (Lambda): evaluates transcript, persists the lead journey, sends the shop notification email, and runs QUO SMS when configured.
- `amplify/functions/chatkit-message-link` (Lambda): resolves short-lived token links used by
  message handoff actions in lead notification emails (SMS entry).
- `DynamoDB (ChatLeadHandoffDedupeTable)`: enforces one completed handoff per thread and tracks lease/error state.
- `DynamoDB (LeadJourneys/LeadRecords/LeadContacts/LeadJourneyEvents)`: stores the lead journey and qualification state.
- `DynamoDB (ChatkitMessageLinkTokenTable)`: stores message draft links with TTL.
- `SES`: sends the final email (raw MIME with optional inline image parts).
- `OpenAI ChatKit`: holds canonical thread, transcript history, and hosted attachment context.

## Retention model

Current retention in this repo:

- Attachments:
  - Craig's backend does not currently create a separate S3 attachment archive.
  - Chat attachments are treated as ChatKit conversation context, not a Craig-owned photo system of record.
  - See `docs/chatkit/attachment-storage-decision.md`.
- Handoff dedupe (`DynamoDB`):
  - `thread_id` state (`processing/completed/error`) with `ttl` from `LEAD_DEDUPE_TTL_DAYS`.
  - Current TTL is configured in `amplify/functions/chat-lead-handoff/handler.ts`.
- Lead journey data (`DynamoDB`):
  - Journey/contact/event/record tables are retained as the operational lead system.
- Message link tokens (`DynamoDB`):
  - `MESSAGE_LINK_TOKEN_TTL_DAYS` in `handler.ts`.
  - Current TTL is **7 days**.
- Chat transcripts:
  - Not persisted in this repo.
  - Source-of-truth transcript is in OpenAI ChatKit thread history (`openai.beta.chatkit.threads` APIs).
- Attachment inline-email fetch window:
  - Backend inlines only images under `LEAD_INLINE_ATTACHMENT_MAX_BYTES` (**3 MB**) in the raw email payload.
  - Larger/unsupported items remain as links in the email.

## Decision summary

- Primary trigger is still fully automatic (no button click required by customer).
- The quiet-window timer on the frontend is now 5 minutes (`300_000` ms).
- The backend only completes the handoff when the summary model returns `handoff_ready = true`.
- The email body now inlines small preview images so photos are visible inline in
  the owner email when the hosted preview URL can be fetched.
- Lead notification email quick actions include `Send via SMS` for manual fallback text handoff.
- Legacy SMS-named link contracts were removed in this phase (breaking change).
- No new AWS service was introduced. This is implemented with existing Lambdas,
  SES, DynamoDB, and existing ChatKit runtime behavior.

## Problem this solved

The previous behavior could complete the handoff while the chat was still active.
A user might receive another follow-up message after the send and that message would
not be included in the transcript used for summarization.

This caused:

- premature summary fields marked missing
- weak context for the owner
- unnecessary back-and-forth to re-contact the customer

For small traffic clients (e.g., roughly a few chats per week), the goal is quality
over speed:

- One reliable handoff
- Fuller context
- Better follow-up readiness for the owner

## Why this is better for the business

- Reduces noisy or low-quality leads (less confusion and fewer clarifications).
- Keeps one email per thread through existing DynamoDB dedupe + lease logic.
- Preserves continuity between transcript and extracted fields by waiting longer and
  requiring readiness.
- Shows photo context inline for faster decision-making by the owner.

## Current flow (high-level)

```
Customer chats in ChatKit
  └─> Frontend tracks activity and interaction
      ├─> After 5 min inactivity while open -> POST /chat/handoff { reason: "idle" }
      ├─> On tab hide/visibility change -> POST /chat/handoff { reason: "pagehide" }
      └─> On panel close -> POST /chat/handoff { reason: "chat_closed" }
             |
             v
Backend chat lead handoff handler
  ├─> build transcript from OpenAI thread
  ├─> require at least one customer contact (phone or email)
  ├─> run model summary parse
  ├─> require handoff_ready == true
  ├─> acquire handoff lease in DynamoDB (thread-keyed)
  ├─> fetch attachments via preview URLs when possible
  ├─> build multipart MIME raw email (text + html + inline image parts)
  ├─> send via SES v2 SendEmail (Raw content)
  └─> mark completed (or cool-down on failure)
```

## Before vs after (with root cause mapping)

Before:

```
Chat activity -> auto summary call on every assistant turn
         |
         +--> backend may send on early/mid-chat snapshot
                |
                +--> owner receives incomplete lead
                +--> customer still can continue chat with missing context
```

After:

```
Chat activity -> no auto send path
         |
         +--> 5-minute frontend inactivity OR pagehide/chat_closed
         |        |
         |        +--> backend checks:
         |             - customer contact exists
         |             - optional "not idle" guard for non-auto reasons
         |             - handoff_ready from model
         |
         +--> only if all pass and lease acquired:
                  persist lead journey
                  send shop email / QUO SMS side effects
                  complete once per thread
         +--> otherwise:
                  return reason (missing_contact, not_ready, not_idle, etc.)
```

## Where changes live now

- Frontend lead trigger timing and reasons
  - `Website/src/components/ChatWidgetReact.jsx`
    - `LEAD_QUIET_SEND_MS` (`300_000`)
    - `bumpIdleTimer` → `requestLeadHandoff({ reason: 'idle' })`
    - `pagehide`/`visibilitychange` and `chat_closed` trigger paths

- Backend lead processing and safety gates
  - `Website/amplify/functions/chat-lead-handoff/handler.ts`
    - Contact extraction + empty-thread guard
    - `LEAD_IDLE_DELAY_SECONDS = 300`
    - summary parse requirement `leadSummary?.handoff_ready === true`
    - idempotent lease + completed/error states in DynamoDB
    - response reasons: `already_completed`, `missing_contact`, `not_ready`, `not_idle`, etc.

- Attachment preview + inline embedding
  - `Website/amplify/functions/chat-lead-handoff/email-delivery.ts`
  - `Website/amplify/functions/chat-lead-handoff/attachments.ts`
  - `Website/amplify/functions/chat-lead-handoff/email-mime.ts`
    - `extractAttachments` parses transcript attachment lines
    - `prepareInlineAttachment` fetches a hosted preview URL into bytes
    - `buildRawEmail` generates MIME `multipart/mixed` with `multipart/alternative`
    - send via `new SendEmailCommand(...)` using SES v2 raw content

## How attachments are tied to thread context

1) ChatKit hosted attachment behavior supplies attachment preview metadata.
2) The transcript contains attachment lines in text (`Attachment:` rows).
3) Email handler parses those lines and validates the preview URL.
4) If the URL is fetchable and the image is small enough, bytes are embedded inline:
   - HTML `<img src="cid:...">`
   - MIME part `Content-ID` for each inline image.
5) If inline attachment fails, the email still includes a clickable attachment
   link in diagnostics and attachment list for continuity.

## Operational notes and tradeoffs

- Inline image cap is intentionally conservative: currently `3_000_000` bytes per
  photo to reduce raw email size risk.
- Raw email allows richer rendering but requires strict MIME formatting.
- Existing `LEAD_INLINE_ATTACHMENT_MAX_BYTES` and attachment MIME checks reduce malformed
  or non-image inline payload issues.
- Craig-owned S3 attachment storage is intentionally not active. If photos need to
  become durable lead assets later, design that as a separate attachment-storage feature.

## Open risks to monitor

- SES raw message size limits still apply globally.
- If an image is too large or fails download, fallback link remains available.
- If a hosted preview URL is unavailable when handoff runs, the owner still receives
  the transcript and attachment metadata, but not the inline image.
- If customer keeps chatting after an `idle` handoff attempt, a later `chat_closed`
  path still re-enters and can only complete if summary is `handoff_ready`.

## Troubleshooting quick references

Frontend:

- See `trigger reason` and `lead_reason` from backend response for skip events.
- Confirm trigger fired paths in console/network:
  - `idle`, `pagehide`, `chat_closed`.

Backend:

- OpenAI logs and DynamoDB dedupe record are still the main source of truth
  (`cthr_...`).
- Raw email delivery issues will show up in SES send logs and CloudWatch (`chat-lead-handoff`).

## If process behavior changes

When you change gates, timers, or email payload behavior:

1. Update this document first.
2. Update the implementation files.
3. Update any related docs (`frontend.md`, `backend.md`, `runbook.md`).
4. Add a short changelog note in the PR description.
