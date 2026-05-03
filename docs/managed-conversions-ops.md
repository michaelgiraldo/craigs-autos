# Managed Conversions Ops

Managed conversion provider setup is intentionally **not** an admin web UI concern.

The admin UI should stay focused on lead-specific business decisions: qualify, unqualify, inspect
timeline, and understand conversion feedback status. Provider configuration belongs in text config,
environment/secrets, CLI checks, and automation.

```text
Business decision on a lead -> admin UI
Provider setup and readiness -> config + CLI
Repeatable operational checks -> script/automation
```

## Files

| File | Purpose |
| --- | --- |
| `config/managed-conversion-destinations.json` | Desired destination state checked into git. |
| `scripts/managed-conversions.ts` | Operator CLI for config validation, destination sync, production runtime discovery, outbox inspection, payload dry-runs, and safe worker invocation. |
| `amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts` | Testable parser/readiness/record builder used by the CLI. |
| `amplify/functions/_lead-platform/services/conversion-feedback/provider-config-manifest.ts` | Provider env metadata generated from provider config fields. |
| `amplify/functions/_lead-platform/services/conversion-feedback/providers/*/definition.ts` | Provider SDK definitions. |

## Config-As-Code

The canonical desired state lives in:

```text
config/managed-conversion-destinations.json
```

Default checked-in state:

| Destination | Enabled | Why |
| --- | --- | --- |
| `manual_export` | Yes | Safe fallback and visible workflow state. |
| `google_ads` | No | Needs real account/conversion-action/consent/credential setup before enabling. |
| `yelp_ads` | No | Needs Yelp conversion access/API key before enabling. |

Provider secrets must not be checked into this file. The parser rejects secret-backed provider
fields such as Google OAuth tokens or Yelp API keys when they appear in `provider_config`.

Non-secret values can live in the config file when that improves reviewability. Examples:

```json
{
  "destination_key": "google_ads",
  "enabled": true,
  "provider_config": {
    "mode": "dry_run",
    "customer_id": "1234567890",
    "conversion_action_id": "987654321",
    "currency_code": "USD",
    "ad_user_data_consent": "GRANTED"
  }
}
```

Secrets stay in environment/AWS secrets:

```text
GOOGLE_ADS_REFRESH_TOKEN
GOOGLE_ADS_CLIENT_ID
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_DEVELOPER_TOKEN
YELP_API_KEY
```

## CLI Commands

The CLI has two jobs:

| Job | Commands | Mutates AWS? |
| --- | --- | --- |
| Provider destination setup | `validate`, `readiness`, `sync`, `list-destinations`, `env-template` | Only `sync --apply` writes destination records. |
| Production operation | `runtime`, `list-decisions`, `list-outbox`, `inspect-outbox`, `dry-run-outbox`, `invoke-worker` | Only `invoke-worker --apply` invokes the worker. |

The script discovers production table names from the managed conversion feedback worker Lambda by
default. That keeps local operator commands aligned to the deployed environment without copying table
names by hand.

Use either explicit table options:

```bash
npm run managed-conversions -- list-outbox \
  --outbox-table "$LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME" \
  --profile AdministratorAccess-281934899223
```

Or use the worker Lambda as the source of truth:

```bash
npm run managed-conversions -- runtime \
  --profile AdministratorAccess-281934899223
```

If multiple worker Lambdas exist, pass the exact function name:

```bash
npm run managed-conversions -- runtime \
  --worker-function "$MANAGED_CONVERSION_FEEDBACK_WORKER_FUNCTION_NAME" \
  --profile AdministratorAccess-281934899223
```

If the Amplify-generated name uses an unexpected substring, adjust discovery:

```bash
npm run managed-conversions -- runtime \
  --worker-name-contains managedconversionfeedbackworker \
  --profile AdministratorAccess-281934899223
```

Validate checked-in config:

```bash
npm run managed-conversions:validate
```

Check readiness using current shell env:

```bash
npm run managed-conversions:readiness
```

Check readiness with a local env file:

```bash
npm run managed-conversions -- readiness --env-file .env.local
```

Print provider env keys and defaults:

```bash
npm run managed-conversions:env-template
```

Dry-run a DynamoDB sync:

```bash
npm run managed-conversions -- sync \
  --table "$PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME" \
  --profile AdministratorAccess-281934899223
```

Apply a DynamoDB sync:

```bash
npm run managed-conversions -- sync \
  --apply \
  --table "$PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME" \
  --profile AdministratorAccess-281934899223
```

List current DynamoDB destination records:

```bash
npm run managed-conversions -- list \
  --table "$PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME" \
  --profile AdministratorAccess-281934899223
```

`list` remains a backward-compatible alias for `list-destinations`.

Use `--json` with CLI commands when automation needs stable output.

## Operator Workflow

Managed conversion operation should follow this sequence:

| Step | Command | Why |
| --- | --- | --- |
| 1. Resolve runtime | `runtime` | Confirms the CLI is pointed at the same Lambda/table environment that production uses. |
| 2. Check destination setup | `list-destinations` | Confirms enabled destinations and delivery modes. |
| 3. Inspect queued work | `list-outbox --status queued --due-now` | Finds work the provider worker is eligible to process now. |
| 4. Inspect one item | `inspect-outbox --outbox-id ...` | Shows the lead, decision, destination, attempts, and prior outcomes before taking action. |
| 5. Dry-run payload | `dry-run-outbox --outbox-id ...` | Builds the provider payload without calling the provider API. |
| 6. Invoke worker | `invoke-worker --outbox-id ... --apply` | Processes one item through the same production worker path. |

Production runtime discovery:

```bash
npm run managed-conversions -- runtime \
  --profile AdministratorAccess-281934899223
```

Expected healthy result:

| Field | Healthy value |
| --- | --- |
| `workerDiscovery.reason` | `selected` or `explicit` |
| `workerFunctionName` | The deployed managed-conversion feedback worker Lambda name. |
| `workerFunctionEnvLoaded` | `true` |
| Table sources | `worker_lambda_env`, `environment`, or `option` |

If `workerDiscovery.reason` is `not_found`, the v2 worker is not deployed in the queried AWS
account/region yet. Push/deploy the backend before trying production outbox commands.

List recent conversion decisions:

```bash
npm run managed-conversions -- list-decisions \
  --profile AdministratorAccess-281934899223
```

List queued due outbox items:

```bash
npm run managed-conversions -- list-outbox \
  --status queued \
  --due-now \
  --profile AdministratorAccess-281934899223
```

Inspect one outbox item:

```bash
npm run managed-conversions -- inspect-outbox \
  --outbox-id "$OUTBOX_ID" \
  --profile AdministratorAccess-281934899223
```

Build the provider payload without sending it:

```bash
npm run managed-conversions -- dry-run-outbox \
  --outbox-id "$OUTBOX_ID" \
  --profile AdministratorAccess-281934899223
```

Plan a worker invocation without mutating anything:

```bash
npm run managed-conversions -- invoke-worker \
  --outbox-id "$OUTBOX_ID" \
  --profile AdministratorAccess-281934899223
```

Actually invoke the worker for one item:

```bash
npm run managed-conversions -- invoke-worker \
  --outbox-id "$OUTBOX_ID" \
  --profile AdministratorAccess-281934899223 \
  --apply
```

Batch invocation is intentionally explicit:

```bash
npm run managed-conversions -- invoke-worker \
  --batch-size 10 \
  --profile AdministratorAccess-281934899223 \
  --apply
```

Prefer one-item invocation while activating or debugging a provider. Batch invocation is for known
good provider configuration after dry-runs and one-item worker processing pass.

If AWS reports an expired SSO token, reauthenticate before running production commands:

```bash
aws sso login --profile AdministratorAccess-281934899223
```

## Safety Model

The CLI is designed around "observe first, mutate last":

| Command | Safe default | Mutation path |
| --- | --- | --- |
| `sync` | Plans destination records only and does not read or write DynamoDB. | Add `--apply` to write destination records. |
| `dry-run-outbox` | Builds payload locally and never calls provider APIs. | No mutation mode exists. |
| `invoke-worker` | Prints the Lambda invocation event only. | Add `--apply` to invoke the worker. |

`dry-run-outbox` intentionally bypasses provider HTTP calls even when a destination is configured in
`test` or `live` mode. It uses the provider definition to parse config and build the payload, then
prints the request shape for review.

## Readiness Rules

| State | Meaning | Exit behavior |
| --- | --- | --- |
| `ready` | Enabled destination has enough configuration for its current mode. | Success |
| `disabled` | Destination is disabled in config or provider mode is disabled. | Success |
| `needs_destination_config` | Enabled destination is missing required config for its current mode. | Failure |
| `adapter_missing` | Destination is enabled but no provider adapter exists yet. | Failure |

`sync` refuses to apply enabled unready destinations by default. Use `--allow-unready` only when
you intentionally want DynamoDB to contain a destination that will not send yet.

## Boundary Rule

Do not add a web UI just because a value is important. Importance and UI-worthiness are different.

Use a web UI when a non-developer must make a business decision while looking at a specific lead.

Use config/CLI/docs when the task is environment setup, provider setup, credential management,
deployment wiring, readiness validation, or automation.

This keeps the admin surface small and makes provider work reviewable in git.
