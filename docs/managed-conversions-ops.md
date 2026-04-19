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
| `scripts/managed-conversions.ts` | Operator CLI for validate/readiness/sync/list/env-template. |
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
YELP_CONVERSION_API_KEY
```

## CLI Commands

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

Use `--json` with `validate`, `readiness`, `sync`, or `list` when automation needs stable output.

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
