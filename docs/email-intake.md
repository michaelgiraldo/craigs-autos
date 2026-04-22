# Inbound Email Lead Intake

Inbound email lead intake is backend-only. It does not add a public website route.

## Flow

1. Google Workspace keeps `contact@craigs.autos` as the public Google Group.
2. Google Workspace routing copies messages for `contact@craigs.autos` to the hidden SES recipient `contact-intake@email-intake.craigs.autos`.
3. SES receives mail for the `email-intake.craigs.autos` subdomain and stores raw MIME in the private S3 inbox.
4. S3 object creation invokes `email-intake-capture`.
5. The Lambda parses MIME, validates the Google route headers, rejects replies/auto-responses/non-leads, and sends only email text plus JPEG/PNG/WebP photo attachments to OpenAI.
6. Accepted leads reserve `LeadFollowupWork`, persist into the journey-first lead tables, and hand the work to `lead-followup-worker`.
7. The worker sends the first customer response by email, using `contact@craigs.autos` for customer-visible `From` and `Reply-To`.
8. The worker sends the shop notification and attaches accepted inbound photos when they still fit the lead notification email budget.
9. Raw S3 mail is explicitly deleted after completed processing. Rejected/skipped messages are deleted by the intake Lambda. A 1-day S3 lifecycle rule is only a safety net.

## Google Workspace Requirements

The route should copy, not replace, messages addressed to `contact@craigs.autos`.

Required route evidence:

- `X-Craigs-Google-Route: contact-public-intake`
- `X-Gm-Original-To: contact@craigs.autos`

Both headers are required. `email-intake-capture` rejects the message before
OpenAI classification with `missing_expected_google_route` when either header is
missing or mismatched. Direct hidden-recipient intake is disabled.

Do not make `contact-intake@email-intake.craigs.autos` a direct member of the public group when this routing rule is active. Membership plus routing can duplicate SES deliveries.

## AWS Resources

Configured in `amplify/backend/email-intake.ts`:

- S3 bucket for raw inbound MIME under `raw/`
- S3 lifecycle expiration after 1 day
- SES receipt rule set for `contact-intake@email-intake.craigs.autos`
- Active receipt rule set custom resource
- DynamoDB `EmailIntakeLedger` for message/thread idempotency

Route53 DNS is intentionally manual. Add this record in the public `craigs.autos` hosted zone:

```text
email-intake.craigs.autos.  MX  10 inbound-smtp.us-west-1.amazonaws.com.
```

SES only has one active receipt rule set per region. This backend activates `craigs-autos-email-intake`; if the AWS account already has inbound SES receipt rules in the same region, merge those rules into this rule set before deploying.

## Code Map

- SES/S3/DNS/ledger wiring: `amplify/backend/email-intake.ts`
- Lambda wrapper: `amplify/functions/email-intake-capture/handler.ts`
- Orchestration: `amplify/functions/email-intake-capture/process-email-intake.ts`
- MIME parsing/photo filtering: `amplify/functions/email-intake-capture/mime.ts`
- OpenAI classification/drafting: `amplify/functions/email-intake-capture/evaluation.ts`
- Email lead bundle: `amplify/functions/_lead-platform/services/intake-email.ts`
- Shared follow-up work domain: `amplify/functions/_lead-platform/domain/lead-followup-work.ts`
- Shared follow-up work repo: `amplify/functions/_lead-platform/repos/dynamo/followup-work.ts`
- Email-first follow-up branch: `amplify/functions/lead-followup-worker/workflow.ts`
- Threaded customer email: `amplify/functions/lead-followup-worker/customer-email.ts`
- Lead notification/OpenAI photo attachment loading: `amplify/functions/lead-followup-worker/lead-attachments.ts`

## Guardrails

- Only JPEG, PNG, and WebP attachments are processed.
- PDFs, documents, ZIP files, and HEIC are ignored in v1.
- Replies and messages with `In-Reply-To` or `References` are skipped before OpenAI.
- Internal `@craigs.autos` senders, auto-submitted mail, mailing lists, and delivery reports are skipped.
- One automatic customer response is queued per email thread ledger key and `LeadFollowupWork.idempotency_key`.
- The email `followup_work_id` is deterministically derived from the email
  thread idempotency key; the hidden SES message id is not used as the durable
  work identity.
- Unsupported or skipped raw S3 mail is deleted immediately.

## Validation

Run:

```sh
npm run typecheck:backend
npm run test:backend
npm run validate:business-profile
```
