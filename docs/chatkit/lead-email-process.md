# Craig’s Auto Upholstery Lead Email Process

This document captures the current lead handoff design for chat leads and is meant to
be maintained as the process evolves.  
The file is intentionally not date-stamped so it remains the single source of truth.

Scope:

- Chat frontend trigger behavior
- Backend readiness checks and idempotency
- How attachments/photos are attached to lead emails
- How this supports the owner workflow (single high-quality handoff email)

## AWS components and purpose

- `amplify/functions/chatkit-session` (Lambda): creates short-lived OpenAI session secrets for the browser.
- `amplify/functions/chatkit-lead-email` (Lambda): builds transcript, summarizes, and sends lead email.
- `amplify/functions/chatkit-attachment-upload` (Lambda): receives user files and stores them in S3.
- `amplify/functions/chatkit-sms-link` (Lambda): creates short-lived tokens for click-safe SMS links in the email.
- `S3 bucket (chatkit-attachment-bucket)`: stores uploaded attachments and serves them with preview URLs.
- `DynamoDB (ChatkitLeadDedupeTable)`: enforces one send per thread and tracks lease/error state.
- `DynamoDB (ChatkitLeadAttributionTable)`: stores lead metadata for offline conversion use.
- `DynamoDB (ChatkitSmsLinkTokenTable)`: stores SMS draft links with TTL.
- `SES`: sends the final email (raw MIME with optional inline image parts).
- `OpenAI ChatKit`: holds canonical thread and transcript history.

## Retention model

Current retention in this repo:

- Attachments (`S3`):
  - Kept in `chatkit-attachments/<id>.ext` objects under `chatkit-attachment-bucket`.
  - Bucket lifecycle rule is set to **365 days** in `Website/amplify/backend.ts`.
- Dedupe leads (`DynamoDB`):
  - `thread_id` state (`sending/sent/error`) with `ttl` from `LEAD_DEDUPE_TTL_DAYS`.
  - Current TTL is **30 days** (`LEAD_DEDUPE_TTL_DAYS` in `handler.ts`).
- Lead attribution metadata (`DynamoDB`):
  - `ChatkitLeadAttributionTable` uses `LEAD_ATTRIBUTION_TTL_DAYS`.
  - Current TTL is **180 days**.
- SMS link tokens (`DynamoDB`):
  - `SMS_LINK_TOKEN_TTL_DAYS` in `handler.ts`.
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
- The backend only sends when the summary model returns `handoff_ready = true`.
- The email body now inlines small preview images so photos are visible inline in
  the owner email, no extra clicks needed.
- No new AWS service was introduced. This is implemented with existing Lambdas,
  S3, SES, and DynamoDB plus existing chat runtime behavior.

## Problem this solved

The previous behavior could send lead email while the chat was still active.
A user might receive another follow-up message after the send and that message would
not be included in the transcript used for summarization.

This caused:

- premature summary fields marked missing
- weak context for the owner
- unnecessary back-and-forth to re-contact the customer

For small traffic clients (e.g., roughly a few chats per week), the goal is quality
over speed:

- One reliable email
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
      ├─> After 5 min inactivity while open -> POST /lead { reason: "idle" }
      ├─> On tab hide/visibility change -> POST /lead { reason: "pagehide" }
      └─> On panel close -> POST /lead { reason: "chat_closed" }
             |
             v
Backend /lead handler
  ├─> build transcript from OpenAI thread
  ├─> require at least one customer contact (phone or email)
  ├─> run model summary parse
  ├─> require handoff_ready == true
  ├─> acquire send lease in DynamoDB (thread-keyed)
  ├─> fetch attachments via preview URLs when possible
  ├─> build multipart MIME raw email (text + html + inline image parts)
  ├─> send via SES SendRawEmail
  └─> mark sent + message id (or cool-down on failure)
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
                  build final email with inline photos + summary
                  send once per thread
         +--> otherwise:
                  return reason (missing_contact, not_ready, not_idle, etc.)
```

## Where changes live now

- Frontend lead trigger timing and reasons
  - `Website/src/components/ChatWidgetReact.jsx`
    - `LEAD_QUIET_SEND_MS` (`300_000`)
    - `bumpIdleTimer` → `sendLeadEmail({ reason: 'idle' })`
    - `pagehide`/`visibilitychange` and `chat_closed` trigger paths

- Backend lead processing and safety gates
  - `Website/amplify/functions/chatkit-lead-email/handler.ts`
    - Contact extraction + empty-thread guard
    - `LEAD_IDLE_DELAY_SECONDS = 300`
    - summary parse requirement `leadSummary?.handoff_ready === true`
    - idempotent lease + sent/error states in DynamoDB
    - response reasons: `already_sent`, `missing_contact`, `not_ready`, `not_idle`, etc.

- Attachment preview + inline embedding
  - `Website/amplify/functions/chatkit-lead-email/handler.ts`
    - `extractAttachments` parses transcript attachment lines
    - `parseAttachmentStorageKey` extracts safe S3 keys
    - `fetchInlineAttachment` fetches preview URL into bytes
    - `buildRawEmail` generates MIME `multipart/mixed` with `multipart/alternative`
    - send via `new SendRawEmailCommand(...)`
  - `Website/amplify/backend.ts`
    - passes `CHATKIT_ATTACHMENT_PREVIEW_BASE_URL` into lead-email Lambda env
  - `Website/amplify/functions/chatkit-attachment-upload/handler.ts`
    - attachments are saved in `chatkit-attachments/` keys in S3
    - GET `?id=<key>` returns binary attachment payload

## How attachments are tied to thread context

1) ChatKit upload flow returns `preview_url` from attachment function.
2) The transcript contains attachment lines in text (`Attachment:` rows).
3) Email handler parses those lines and maps `preview_url` to storage key.
4) If key is valid + small enough image, attachment bytes are fetched and embedded inline:
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
- Bucket retention is conservative but independent from the lead email process itself.
  If you need shorter/longer retention, update the lifecycle rule in `backend.ts` and
  corresponding business runbook expectations.

## Open risks to monitor

- SES raw message size limits still apply globally.
- If an image is too large or fails download, fallback link remains available.
- If customer keeps chatting after an `idle` send attempt, a later `chat_closed`
  path still re-enters and can only send if summary is `handoff_ready`.

## Troubleshooting quick references

Frontend:

- See `trigger reason` and `lead_reason` from backend response for skip events.
- Confirm trigger fired paths in console/network:
  - `idle`, `pagehide`, `chat_closed`.

Backend:

- OpenAI logs and DynamoDB dedupe record are still the main source of truth
  (`cthr_...`).
- Raw email delivery issues will show up in SES send logs and CloudWatch (`chatkit-lead-email`).

## If process behavior changes

When you change gates, timers, or email payload behavior:

1. Update this document first.
2. Update the implementation files.
3. Update any related docs (`frontend.md`, `backend.md`, `runbook.md`).
4. Add a short changelog note in the PR description.
