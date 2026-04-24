# Email Intake Route Marker

## Summary

Craig's public contact address, `contact@craigs.autos`, is delivered through
Google Workspace before the AWS SES intake copy reaches the email intake Lambda.
The stable production signal for the automation copy is the custom Workspace
route marker:

```text
X-Craigs-Google-Route: contact-public-intake
```

The email intake route guard treats that marker as sufficient route evidence.
It does not require `X-Gm-Original-To` or Google Group list headers because
Google does not reliably add those headers to every valid routed copy.

## Safety Model

Route trust and automation eligibility are separate decisions:

- `X-Craigs-Google-Route: contact-public-intake` means Google Workspace
  intentionally copied the message to the hidden SES intake recipient.
- `In-Reply-To` or `References` means the message is part of an existing email
  thread and must be skipped before OpenAI classification.
- `From: *@craigs.autos` means the message is internal and must be skipped before
  OpenAI classification, even when Victor reply-all copies `contact@craigs.autos`.
- Auto-submitted mail, delivery reports, and unrelated mailing list traffic are
  skipped before OpenAI classification.

Google Group list headers such as `Mailing-list` and `List-ID` may appear on
some copies. The backend only uses the known Craig's contact group shape to avoid
misclassifying a valid contact-group customer message as generic bulk list mail.
Those headers are not route evidence.

## Guardrail Tests

Keep these cases covered by tests:

- Route marker present, no `X-Gm-Original-To`, no Google Group headers: accepted.
- Route marker missing: rejected.
- Customer reply with `In-Reply-To` or `References`: rejected.
- Internal reply-all from `@craigs.autos`: rejected.
- Known Craig's contact Google Group list shape: not rejected as bulk.
- Unrelated mailing list mail with the route marker: rejected before OpenAI.

## Operational Debugging

For a specific missed email:

1. Normalize the raw `Message-ID`.
2. Compute the email intake ledger keys from the normalized message id.
3. Check the `EmailIntakeLedger` table for `message:*` and `thread:*` rows.
4. If the reason is `missing_expected_google_route`, inspect
   `X-Craigs-Google-Route`.
5. If the reason is `existing_email_thread`, inspect `In-Reply-To` and
   `References`.
6. If the reason is `internal_sender`, inspect `From`.
7. Confirm whether follow-up work exists under the expected `email:*`
   idempotency key.
