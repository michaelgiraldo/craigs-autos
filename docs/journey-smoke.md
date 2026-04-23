# Journey Smoke

This repo now has a production-safe journey smoke harness:

```bash
npm run smoke:journey -- --profile AdministratorAccess-281934899223
npm run smoke:journey -- --profile AdministratorAccess-281934899223 --apply
```

What it does:

1. discovers the deployed `quote-request-submit` Lambda
2. reads its live table configuration
3. invokes the internal `__smoke_test` path directly
4. verifies the synthetic journey, lead record, contact, contact points, contact observations, and form submit event in DynamoDB
5. verifies that `LeadFollowupWork` was **not** created
6. deletes the synthetic records unless `--keep-records` is passed

Why it is safe:

- it uses the existing internal smoke mode in `quote-request-submit`
- that path persists the lead bundle without queueing follow-up work
- cleanup only deletes records that match the synthetic run markers and deterministic ids

Use `--apply` for a live run. Without `--apply`, the script only resolves the live Lambda/runtime and prints the synthetic ids it would use.
