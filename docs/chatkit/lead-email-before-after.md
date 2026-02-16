# Lead Email Triggering: Before vs After

This doc records an important behavior change in how the shop lead email is sent.
It exists to prevent regressions and to make debugging "missing fields" issues
much easier.

## Terms

- ChatKit thread id: `cthr_...` (canonical conversation id)
- Lead email endpoint: `chatkit-lead-email` (Lambda Function URL)
- Triggers (reason): values passed from frontend -> backend:
  - `idle`
  - `pagehide`
  - `chat_closed`
  - (historical) `auto`
- Dedupe: DynamoDB record keyed by `thread_id = cthr_...` ensures "send once per thread"

## Before (historical behavior)

Frontend triggers (`src/components/ChatWidgetReact.jsx`):

1) `reason = "auto"`
   - Fired on every assistant message completion (`chatkit.response.end`)
   - Intended to send the lead as soon as the chat became actionable

2) `reason = "idle"`
   - Fired after ~90s of inactivity (while chat open)

3) `reason = "pagehide"`
   - Fired on tab hide/unload

4) `reason = "chat_closed"`
   - Fired when the user closed the chat panel

Backend behavior (`amplify/functions/chatkit-lead-email/handler.ts`):

- Every trigger call fetched the thread and generated a structured lead summary.
- For `reason = "auto"`, the backend only sent the email when the summary returned:
  `handoff_ready === true` (model-decided).
- Once an email was successfully sent, DynamoDB was marked `status = "sent"`, so
  later triggers would not re-fetch or re-send.

### The failure mode: "snapshot too early"

Because `auto` triggered immediately after each assistant message, it could send
in the small window between:

- assistant asks a question (ex: location)
- customer replies a few seconds later

Result:

- the email transcript is missing those later messages
- the summary marks fields as missing (location/timeline/etc) even though they
  appear in OpenAI logs later

Example (real thread):

- `cthr_6977ba5715448195b09e9353b2052d450a0911e90bd04fff`
  - dedupe record: `last_reason = "auto"`, `sent_at = 2026-01-26T19:05:14Z`
  - customer replied with location after the send timestamp

ASCII timeline:

```text
11:05:02 assistant asks "What city are you located in?"
11:05:14 lead email sent (reason=auto) -> transcript ends at the assistant question
11:05:16 customer replies "Oakland, yes"
11:05:30 customer provides timeline "three months"
```

Nothing is "wrong" with extraction in this case; the backend never saw those
messages at send time.

## After (current behavior)

We removed `auto` sending to avoid mid-conversation snapshots.

Frontend triggers (`src/components/ChatWidgetReact.jsx`):

1) `reason = "idle"`
   - Fires after ~300s (5 minutes) without in-chat activity
   - The idle timer resets on:
     - assistant responses
     - typing (keydown)
     - clicks/taps in the chat panel
     - focus changes inside the panel

2) `reason = "pagehide"`
   - Still fires on tab hide/unload

3) `reason = "chat_closed"`
   - Still fires when the user closes the chat panel

Backend behavior (unchanged at a high level):

- On each trigger call (until `status = "sent"`), the backend:
  - fetches thread items from OpenAI
  - builds transcript lines
  - generates a structured lead summary via `responses.parse(...)`
  - emails via SES
  - records `sent` in DynamoDB (idempotent)

Key difference:

- We now wait for a "quiet period" (idle/pagehide/close) before sending, which
  makes the email much more likely to include the complete, up-to-date transcript.

ASCII flow:

```text
Any activity in chat panel -> reset idle timer (300s)

Idle timer expires -> POST /lead (reason=idle)
                   -> backend applies readiness gate and sends when ready
```

Current readiness gate (applies to all non-auto paths in practice):

- contact required: phone or email must be present
- `leadSummary?.handoff_ready === true`

If the summary is not yet ready, the response includes:

- `sent: false`
- `reason: handoff_reason or 'not_ready'`
- `missing_info` (from model output when available)

## What stayed the same (important)

- The backend can still be called multiple times; DynamoDB enforces "send once".
- The summary model can be executed multiple times BEFORE the first successful send
  (once per trigger call).
- AFTER a successful send (`status = "sent"`), the backend returns early and does
  not recompute or resend.

## Notes for future improvements

The original improvement from this document was adding that gate to idle path.
The current path also applies this for `pagehide`/`chat_closed` so manual close or
tab hide does not bypass completeness checks.

If we ever re-introduce a near-real-time trigger, it must either:

- support "final update" sends (store a sent watermark and allow one update on close/pagehide), or
- use an explicit agent signal (client tool) to indicate the wrap-up moment.
