# Lead Platform Incident Runbook

## Primary recovery path

Craig's lead follow-up incidents are handled through:

1. alert email to `alerts@craigs.autos`
2. human manual follow-up with the customer if needed
3. optional engineering inspection in AWS/logs/code

The admin UI is not the primary recovery surface for this workflow.

## What the alert means

Lead failure alerts are sent from `system@craigs.autos` to `alerts@craigs.autos` when:

- `LeadFollowupWork` enters `error`
- `LeadFollowupWork` stays `queued` too long
- `LeadFollowupWork` stays `processing` past its lease expiry

The system sends one alert per work item after a failure is detected. It does not automatically replay the full follow-up workflow.

## Immediate response

When an alert arrives:

1. read the alert subject and severity
2. check whether `Customer response sent` is `no`
3. if `no`, call or email the customer manually as soon as possible
4. if `yes`, inspect whether the failure was internal-only and whether any additional customer action is still needed

## Severity guide

| Severity | Meaning | Action |
|---|---|---|
| `ACTION REQUIRED` | No customer response was sent | Contact the customer manually |
| `STUCK` | Work item stalled in `queued` or `processing` | Inspect the record and contact the customer manually if needed |
| `CHECK SYSTEM` | Customer may already have a response, but internal follow-up failed | Inspect the system issue and confirm whether manual outreach is still needed |

## Engineering inspection

Use these identifiers from the alert email:

- `idempotency_key`
- `lead_record_id`
- `journey_id`

Check:

1. CloudWatch logs for `lead-followup-worker`
2. CloudWatch logs for `lead-followup-alert-monitor`
3. the `LeadFollowupWork` record in DynamoDB
4. whether SES accepted the customer-facing or internal send

## Safe validation

To validate the alert channel itself without touching customer workflows:

```bash
npm run smoke:lead-alerts -- --profile AdministratorAccess-281934899223 --apply
```

This sends one `[Lead Alert][TEST]` message from `system@craigs.autos` to `alerts@craigs.autos` and does not re-drive customer follow-up.
