# Email Intake Smoke

This repo now has a synthetic email intake smoke harness:

```bash
npm run smoke:email-intake -- --profile AdministratorAccess-281934899223
npm run smoke:email-intake -- --profile AdministratorAccess-281934899223 --apply
```

What it does:

1. discovers the deployed `email-intake-capture` Lambda
2. discovers the live raw-email bucket wired to that Lambda
3. uploads a synthetic raw MIME email under `synthetic-email-intake/...`
4. runs the intake code locally against the live AWS bucket, ledger table, lead tables, and follow-up table
5. verifies the accepted email lead, `LeadFollowupWork`, and ledger rows
6. runs the follow-up worker code locally with stubbed senders so no real customer/shop email is sent
7. verifies the raw MIME object is deleted by worker cleanup
8. deletes the synthetic records unless `--keep-records` is passed

Important scope:

- this verifies the SES/S3/Lambda-boundary intake path and the worker cleanup path
- it does **not** rely on the live deployed worker Lambda
- it does **not** send real email to the customer or the shop

Without `--apply`, the script only resolves the live runtime and prints the synthetic ids it would use.
