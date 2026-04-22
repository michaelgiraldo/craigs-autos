# Email Intake Google Group Routing

## Summary

Craig's public contact address, `contact@craigs.autos`, is delivered through a
Google Group before the AWS SES intake copy reaches the email intake Lambda.
That group redistribution path does not reliably include Google's
`X-Gm-Original-To` header, even when the Workspace routing setting for that
header is enabled.

The reliable production signal for this path is the custom Workspace route
marker:

```text
X-Craigs-Google-Route: contact-public-intake
```

When mail is redistributed by the known Craig's contact Google Group, the raw
message also carries group identity headers similar to:

```text
To: contact@craigs.autos
Sender: contact@craigs.autos
Return-Path: <contact+...@craigs.autos>
Precedence: list
Mailing-list: list contact@craigs.autos; contact contact+owners@craigs.autos
List-ID: <contact.craigs.autos>
```

The email intake route guard accepts only these two trusted shapes:

1. Direct Workspace route:
   - `X-Craigs-Google-Route: contact-public-intake`
   - `X-Gm-Original-To: contact@craigs.autos`

2. Craig's contact Google Group route:
   - `X-Craigs-Google-Route: contact-public-intake`
   - visible `To: contact@craigs.autos`
   - Craig's contact group `Mailing-list` or `List-ID`
   - Craig's contact group `Sender` or `Return-Path`

Unrelated mailing lists must still be rejected before OpenAI classification.

## Why `X-Gm-Original-To` Was Not Enough

Google documents `Add X-Gm-Original-To header` as a routing/compliance option
that adds a header when the recipient is changed, so the receiving server can
see the original envelope recipient.

Google also documents custom headers as a separate routing option. The Craig's
route marker is a custom header, not the same setting as
`X-Gm-Original-To`.

Relevant Google Workspace references:

- <https://support.google.com/a/answer/2368153>
- <https://support.google.com/a/answer/1346936>

In production tests on April 21, 2026, messages sent to `contact@craigs.autos`
through the Google Group included `X-Craigs-Google-Route` but did not include
`X-Gm-Original-To`. The intake ledger rejected those messages as
`missing_expected_google_route` before this fix.

## Guardrail

Do not loosen the intake gate to accept arbitrary list mail. The Google Group
exception is intentionally narrow because list headers are also used by
newsletters, vendor solicitations, mailing lists, and auto-generated traffic.

Before changing this behavior, keep these cases covered by tests:

- Direct Workspace route with `X-Gm-Original-To` is accepted.
- Craig's contact Google Group route without `X-Gm-Original-To` is accepted.
- Missing `X-Craigs-Google-Route` is rejected.
- Missing `X-Gm-Original-To` without Craig's contact group proof is rejected.
- Unrelated mailing list mail is rejected even when it has the custom route
  marker and original recipient header.

## Operational Debugging

For a specific missed email:

1. Normalize the raw `Message-ID`.
2. Compute the email intake ledger keys from the normalized message id.
3. Check the `EmailIntakeLedger` table for `message:*` and `thread:*` rows.
4. If the reason is `missing_expected_google_route`, inspect these raw headers:
   - `X-Craigs-Google-Route`
   - `X-Gm-Original-To`
   - `To`
   - `Sender`
   - `Return-Path`
   - `Precedence`
   - `Mailing-list`
   - `List-ID`
5. Confirm whether follow-up work exists under the expected `email:*`
   idempotency key.
