# Craig's Auto Upholstery Chat Lead Handoff Process

This document describes the current chat lead handoff path after the shared
follow-up outbox migration.

## AWS Components

- `amplify/functions/chat-session-create`: creates short-lived OpenAI session secrets for the browser.
- `amplify/functions/chat-handoff-promote`: evaluates a ChatKit thread, persists the captured lead, and enqueues `LeadFollowupWork`.
- `amplify/functions/lead-followup-worker`: owns first-response delivery, owner notification, QUO SMS, SES customer email, and lead outreach sync.
- `DynamoDB LeadFollowupWork`: durable first-response outbox with `followup_work_id`, `idempotency_key`, status, lease fields, provider results, and TTL.
- `DynamoDB LeadJourneys/LeadRecords/LeadContacts/LeadJourneyEvents`: journey-first operational lead storage.
- `OpenAI ChatKit`: canonical thread, transcript history, and hosted attachment context.

## Current Flow

```text
Customer chats in ChatKit
  -> Frontend posts /chat-handoffs after idle/pagehide/chat_closed
  -> chat-handoff-promote fetches the thread and evaluates readiness
  -> blocked/deferred states append workflow events only
  -> ready lead persists Contact/Journey/LeadRecord
  -> ready lead creates LeadFollowupWork with idempotency_key = chat:<cthr_...>
  -> lead-followup-worker leases the work item
  -> worker sends first response and owner notification
  -> worker updates LeadFollowupWork and lead outreach state
```

## Idempotency

Chat handoff no longer has a separate chat dispatch ledger. The canonical
idempotency record is the shared follow-up work item:

- `followup_work_id = chat_<cthr_...>`
- `idempotency_key = chat:<cthr_...>`

If the work item is `queued` or `processing`, chat handoff returns
`followup_in_progress`. If the work item is `completed`, it returns
`already_completed`.

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
- Owner notification: `amplify/functions/lead-followup-worker/owner-email.ts` and `email-content.ts`
- QUO SMS: `amplify/functions/lead-followup-worker/quo-sms.ts`

Do not add SES or QUO delivery back to `chat-handoff-promote`; that Lambda is an
intake adapter, not a delivery worker.

## Troubleshooting

- Start with the ChatKit thread id (`cthr_...`).
- Check OpenAI thread logs for transcript/evaluation context.
- Check DynamoDB `LeadFollowupWork` by `idempotency_key = chat:<cthr_...>`.
- Check `lead-followup-worker` CloudWatch logs for delivery errors.
- Check lead admin/JourneyEvent state to confirm the captured lead and outreach status.
