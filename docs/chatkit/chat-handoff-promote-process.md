# Craig's Auto Upholstery Chat Lead Handoff Process

This document describes the current chat lead handoff path after the shared
follow-up outbox migration.

## AWS Components

- `amplify/functions/chat-session-create`: creates short-lived OpenAI session secrets for the browser.
- `amplify/functions/chat-handoff-promote`: evaluates a ChatKit thread, reserves `LeadFollowupWork`, persists the captured lead, and invokes the worker.
- `amplify/functions/lead-followup-worker`: owns first-response delivery, lead notification, QUO SMS, SES customer email, and lead outreach sync.
- `DynamoDB LeadFollowupWork`: durable first-response outbox keyed by `idempotency_key`, with `followup_work_id`, status, lease fields, provider results, and TTL.
- `DynamoDB LeadJourneys/LeadRecords/LeadContacts/LeadJourneyEvents`: journey-first operational lead storage.
- `OpenAI ChatKit`: canonical thread, transcript history, and hosted attachment context.

## Current Flow

```text
Customer chats in ChatKit
  -> Frontend posts /chat-handoffs after idle/pagehide/chat_closed
  -> chat-handoff-promote fetches the thread and evaluates readiness
  -> blocked/deferred states append workflow events only
  -> ready lead reserves LeadFollowupWork with idempotency_key = chat:<cthr_...>
  -> ready lead persists Contact/Journey/LeadRecord
  -> ready lead updates reserved work with contact/journey/lead ids
  -> lead-followup-worker leases the work item
  -> worker sends first response and lead notification
  -> worker updates LeadFollowupWork and lead outreach state
```

## Idempotency

Chat handoff no longer has a separate chat dispatch ledger. The canonical
idempotency record is the shared follow-up work item:

- `idempotency_key = chat:<cthr_...>`
- `followup_work_id` is deterministically derived from the idempotency key for logs/API responses.

If the work item is `queued` or `processing`, chat handoff usually returns
`status = "already_accepted"` and does not rerun lead persistence or worker
invocation. A queued work item missing lead linkage is repaired by rerunning
idempotent lead persistence, updating the work item, invoking the worker, and
returning `status = "accepted"`. If the work item is `error`, it returns
`status = "worker_failed"`. If the work item is `completed`, it returns
`status = "worker_completed"`.

## Retention

- Chat transcripts are not persisted by Craig's backend; the source of truth is the OpenAI ChatKit thread.
- Craig's backend does not create a separate S3 archive for chat attachments.
- `LeadFollowupWork` has a TTL and stores only operational first-response state.
- Lead journey/contact/event/record tables are the operational lead system.

## Where To Change Behavior

- Handoff trigger timing: `src/components/ChatWidgetReact.jsx`
- Readiness/evaluation: `amplify/functions/chat-handoff-promote/evaluation.ts` and `lead-summary.ts`
- Chat lead persistence: `amplify/functions/chat-handoff-promote/promotion.ts`
- Shared follow-up policy/workflow: `amplify/functions/lead-followup-worker/workflow.ts`
- Customer email: `amplify/functions/lead-followup-worker/customer-email.ts`
- Lead notification: `amplify/functions/lead-followup-worker/lead-notification-email.ts` and `lead-notification-template.ts`
- QUO SMS provider: `amplify/functions/_lead-platform/services/providers/quo/quo-provider.ts`

Do not add SES or QUO delivery back to `chat-handoff-promote`; that Lambda is an
intake adapter, not a delivery worker.

## Troubleshooting

- Start with the ChatKit thread id (`cthr_...`).
- Check OpenAI thread logs for transcript/evaluation context.
- Check DynamoDB `LeadFollowupWork` by `idempotency_key = chat:<cthr_...>`.
- Check `lead-followup-worker` CloudWatch logs for delivery errors.
- Check lead admin/JourneyEvent state to confirm the captured lead and outreach status.
