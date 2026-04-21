# Chat Lead Handoff Triggering: Before vs After

This doc records an important behavior change in how the chat lead handoff is completed.
It exists to prevent regressions and to make debugging "missing fields" issues
much easier.

## Terms

- ChatKit thread id: `cthr_...` (canonical conversation id)
- Chat handoff endpoint: `POST /chat-handoffs` (public API route)
- Triggers (reason): values passed from frontend -> backend:
  - `idle`
  - `pagehide`
  - `chat_closed`
  - (historical) `auto`
- Dedupe: DynamoDB record keyed by `thread_id = cthr_...` ensures "complete once per thread"

## Before (historical behavior)

Frontend triggers (`src/components/ChatWidgetReact.jsx`):

1) `reason = "auto"`
   - Fired on every assistant message completion (`chatkit.response.end`)
   - Intended to hand off the lead as soon as the chat became actionable

2) `reason = "idle"`
   - Fired after ~90s of inactivity (while chat open)

3) `reason = "pagehide"`
   - Fired on tab hide/unload

4) `reason = "chat_closed"`
   - Fired when the user closed the chat panel

Backend behavior (`amplify/functions/chat-handoff-promote/handler.ts`):

- Every trigger call fetched the thread and generated a structured lead summary.
- For `reason = "auto"`, the backend only completed handoff when the summary returned:
  `handoff_ready === true` (model-decided).
- Once the handoff successfully completed, DynamoDB was marked `status = "completed"`, so
  later triggers would not re-fetch or re-run side effects.

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
  - dedupe record: `last_reason = "auto"`, historical `sent_at = 2026-01-26T19:05:14Z`
  - customer replied with location after the handoff timestamp

ASCII timeline:

```text
11:05:02 assistant asks "What city are you located in?"
11:05:14 handoff completed (reason=auto) -> transcript ends at the assistant question
11:05:16 customer replies "Oakland, yes"
11:05:30 customer provides timeline "three months"
```

Nothing is "wrong" with extraction in this case; the backend never saw those
messages at send time.

## After (current behavior)

We removed the `auto` trigger to avoid mid-conversation snapshots.

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

Backend behavior:

- On each trigger call until `LeadFollowupWork.idempotency_key = chat:<threadId>` exists,
  the backend:
  - fetches thread items from OpenAI
  - builds transcript lines
  - generates a structured lead summary via `responses.parse(...)`
  - returns `status = "blocked"` or `status = "deferred"` if the chat is not ready
  - reserves `LeadFollowupWork` before lead persistence when the chat is ready
  - persists the lead and invokes `lead-followup-worker`

Key difference:

- We now wait for a "quiet period" (idle/pagehide/close) before completing handoff,
  which makes the shop notification much more likely to include the complete,
  up-to-date transcript.

ASCII flow:

```text
Any activity in chat panel -> reset idle timer (300s)

Idle timer expires -> POST /chat-handoffs (reason=idle)
                   -> backend applies readiness gate and completes when ready
```

Current readiness gate (applies to all non-auto paths in practice):

- contact required: phone or email must be present
- `leadSummary?.handoff_ready === true`

If the summary is not yet ready, the response includes:

- `status: "blocked"` or `status: "deferred"`
- `reason: handoff_reason or 'not_ready'`
- `missing_info` (from model output when available)

## What stayed the same (important)

- The backend can still be called multiple times; DynamoDB enforces "complete once".
- The summary model can be executed multiple times BEFORE the first successful handoff
  (once per trigger call).
- AFTER a successful handoff, the backend returns `status = "already_accepted"` for
  queued/processing/error work or `status = "worker_completed"` for completed work
  without recomputing or rerunning side effects.

## Notes for future improvements

The original improvement from this document was adding that gate to idle path.
The current path also applies this for `pagehide`/`chat_closed` so manual close or
tab hide does not bypass completeness checks.

If we ever re-introduce a near-real-time trigger, it must either:

- support "final update" handoffs (store a completion watermark and allow one update on close/pagehide), or
- use an explicit agent signal (client tool) to indicate the wrap-up moment.
