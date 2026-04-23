# Lead Alert Smoke

Use this harness to confirm the deployed lead alert monitor is wired to the correct sender and recipient addresses, and optionally send one safe test message.

```bash
npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223
npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223 --apply
npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223 --apply --from-email system@craigs.autos --to-email alerts@craigs.autos
```

What it does:

- discovers the deployed `lead-followup-alert-monitor` Lambda
- reads `LEAD_FAILURE_ALERT_FROM_EMAIL` and `LEAD_FAILURE_ALERT_EMAILS` from its environment
- on `--apply`, sends one `[Lead Alert][TEST]` email from `system@craigs.autos` to `alerts@craigs.autos`
- optional `--from-email` / `--to-email` overrides let you validate the SES path before the new Lambda is deployed

What it does not do:

- it does not invoke `lead-followup-worker`
- it does not create or retry any `LeadFollowupWork`
- it does not send any customer-facing email or SMS
