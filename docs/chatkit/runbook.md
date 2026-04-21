# ChatKit lead intake - runbook

This runbook is for production support and debugging.

It is optimized for: "What do I check first?" and "How do I prove where it broke?"

Related docs:

- Overview: `docs/chatkit/overview.md`
- Frontend: `docs/chatkit/frontend.md`
- Backend: `docs/chatkit/backend.md`
- Agent Builder: `docs/chatkit/agent-builder.md`

## Quick triage: what is broken?

Pick the symptom that best matches:

- A) Chat UI does not load / no input box
- B) Chat loads, but messages fail (session errors)
- C) Chat lead handoff did not complete / shop did not receive notification
- D) Duplicate chat lead handoffs
- E) Wrong language / wrong hours / wrong agent behavior

## Check this first (always)

### 1) Get the ChatKit thread id (cthr_...)

You need the thread id to debug anything.

Ways to get it:

- From the shop notification email body:
  - In **Diagnostics**, copy `Thread: cthr_...`.

- From the browser:
  - DevTools -> Application -> Session Storage -> key `chatkit-thread-id`

- From OpenAI logs if you already have it:
  - https://platform.openai.com/logs/cthr_...

### 2) Open OpenAI logs for the thread

Open:

- https://platform.openai.com/logs/cthr_...

Check:

- The transcript contains the customer's messages.
- The assistant messages look correct (language, no pricing, no hallucinated hours).
- Any errors or tool/task noise.

### 3) Confirm the backend endpoints for this environment

Open the site and fetch:

- `https://chat.craigs.autos/amplify_outputs.json`

Confirm it contains:

- `custom.api_base_url`
- `custom.api_contract`

If these are missing or wrong, the frontend may be calling a placeholder URL.

### 4) Check DynamoDB follow-up work (complete once per thread)

The chat lead handoff system uses `LeadFollowupWork` to ensure only one first response
is created for a `cthr_...`.

Goal:

- Determine whether the backend already queued, processed, or completed first response work.

How to find the table name:

- In AWS Lambda console:
  - Function: `chat-handoff-promote` or `lead-followup-worker`
  - Configuration -> Environment variables -> `LEAD_FOLLOWUP_WORK_TABLE_NAME`

Once you have the table name, get the `LeadFollowupWork` item by its primary key:

AWS CLI example:

```sh
aws dynamodb get-item \
  --region us-west-1 \
  --table-name "<LEAD_FOLLOWUP_WORK_TABLE_NAME>" \
  --key '{"idempotency_key":{"S":"chat:cthr_..."}}'
```

Interpretation:

- `status = completed`:
  - The worker completed first-response handling.
  - Look at `sms_status`, `email_status`, `owner_email_status`, provider ids, and errors.

- `status = processing` and `lock_expires_at` in the future:
  - The worker is processing the item.
  - Wait for the worker lease to expire or inspect CloudWatch.

- `status = error`:
  - Delivery or owner notification failed.
  - Check CloudWatch logs for the error.

### 5) Check CloudWatch logs for the Lambda functions

The two main Lambda functions:

- `chat-session-create` (session minting)
- `chat-handoff-promote` (transcript evaluation + handoff)

In AWS Console:

- Lambda -> Functions -> select function -> Monitor -> View logs in CloudWatch

What to search for:

- Session:
  - "ChatKit session create failed"

- Chat lead handoff:
  - "Chat lead handoff failed"
  - "Lead summary generation failed"
  - "Lead dedupe mark handoff completed failed"
  - "Lead dedupe mark email sent failed"
  - SES errors and throttles

AWS CLI example (requires function name):

```sh
aws logs tail "/aws/lambda/<FUNCTION_NAME>" --region us-west-1 --since 1h --follow
```

### 6) Check SES sending status

In AWS SES console (same region as the backend):

- Verified identities (sender is verified)
- Sending statistics (errors, throttles)
- Bounce/complaint events (if enabled)

If you do not see send attempts:

- The chat lead handoff Lambda may not be getting invoked, or may be exiting early due to
  missing contact info or "not_ready".

## Scenario A: Chat UI does not load / no input box

Symptoms:

- You see a panel but no composer/input.
- Or you see a fallback error message in the chat panel.

Checks:

1) Browser DevTools console:
   - "Failed to load ... chatkit.js" means runtime did not load.
   - "ChatKit.create(): Invalid input" often means invalid `startScreen.prompts[*].icon`.

2) Network tab:
   - Confirm `https://cdn.platform.openai.com/deployments/chatkit/chatkit.js` loads (200).

3) Domain allowlist:
   - Ensure `chat.craigs.autos` is on the allowlist:
     https://platform.openai.com/settings/organization/security/domain-allowlist

4) Session endpoint reachable:
   - Confirm `/amplify_outputs.json` has `custom.api_base_url`.
   - Confirm `POST /chat-sessions` responds from the browser origin (CORS).

Fixes:

- Runtime URL wrong or blocked: update `PUBLIC_CHATKIT_RUNTIME_URL(S)` or allow the CDN.
- Invalid prompt icon: fix `CHAT_COPY[locale].startPrompts` icons.
- Domain not allowlisted: add it in OpenAI settings.
- CORS misconfigured: update `allowedOrigins` in `amplify/backend.ts` and redeploy.

## Scenario B: Chat loads, but messages fail (session errors)

Symptoms:

- Chat UI loads, but sending a message fails.
- Console shows 4xx/5xx from the session endpoint.

Checks:

1) Confirm the session endpoint URL:
   - from `/amplify_outputs.json` key `custom.api_base_url` plus route `/chat-sessions`

2) Confirm the session Lambda is configured with:
   - `OPENAI_API_KEY` secret
   - `CHATKIT_WORKFLOW_ID` secret

3) CloudWatch logs for `chat-session-create`:
   - Look for "Server missing configuration"
   - Look for OpenAI API errors

Common fixes:

- Missing secrets: set in Amplify Secrets for the branch/environment.
- Wrong workflow id: update `CHATKIT_WORKFLOW_ID` in Amplify Secrets.
- Workflow deleted/renamed: workflow id is what matters; verify it still exists.

## Scenario C: Chat lead handoff did not complete / shop did not receive notification

Symptoms:

- Customer chatted and provided contact info, but no email arrived.

Checks (in order):

1) Get the thread id (`cthr_...`) and open OpenAI logs.
2) Check if the chat lead handoff endpoint was called:
   - Browser DevTools -> Network -> look for `POST /chat-handoffs`.
3) Check DynamoDB record:
   - If `/chat-handoffs` returned `status = "accepted"`, this request reserved work and invoked the worker.
   - If it returned `status = "already_accepted"`, a queued/processing work item already exists.
   - If it returned `status = "worker_failed"`, an errored work item already exists and needs worker/debug repair.
   - If it returned `status = "worker_completed"`, the worker already completed first-response handling.
   - If missing, the endpoint may not have been hit or may have crashed before writing.
4) CloudWatch logs for `chat-handoff-promote`.
5) SES console:
   - look for sends, bounces, or sandbox restrictions.

Common causes:

- Contact info was never captured (backend requires phone or email in CUSTOMER messages).
- The handoff completed before the customer provided later details (snapshot timing).
- SES sender not verified, or SES sandbox restrictions.
- Lambda errors (OpenAI API failures, parsing failures).

Notes on "handoff_ready":

- `handoff_ready` is produced by the summary model as a convenience field.
- Current handoff triggers are `idle`, `pagehide`, and `chat_closed` (once contact exists).
- If you see `last_reason = "auto"` in DynamoDB, you're likely looking at an older deployment
  (see `docs/chatkit/chat-handoff-promote-before-after.md`).

## Scenario D: Duplicate chat lead handoffs

Duplicates should not occur because shared follow-up work is keyed by
`idempotency_key = chat:<cthr_...>`.

If you see duplicates, check:

1) Are the emails for the same `cthr_...`?
   - If different thread ids, they are not duplicates; the user created multiple threads.

2) DynamoDB `LeadFollowupWork`:
   - Verify only one item exists for `idempotency_key = chat:<cthr_...>`.
   - Verify `status`, `sms_status`, `email_status`, and `owner_email_status`.

3) Multiple environments:
   - Are two different backends completing handoff (ex: staging + prod)?

Potential causes:

- `LEAD_FOLLOWUP_WORK_TABLE_NAME` missing in that environment.
- A forced re-send happened by deleting the work item.
- Two environments processed the same thread with different follow-up tables.

Note:

- There is no separate chat dispatch ledger. Do not add one back unless the shared
  outbox architecture changes.

## Scenario E: Follow-up work is failed or stuck

Start in the admin lead dashboard:

1) Open the `Follow-Up Work` table.
2) Check the `status`, source, delivery statuses, issue text, and
   `idempotency_key`.
3) Use `Retry` only when the row allows it. Retry re-invokes the worker; it does
   not create another lead or bypass idempotency.
4) Use `Manual` when the row has `delivery_attempt_unconfirmed` or Craig already
   handled the customer outside automation.
5) If neither action is appropriate, inspect CloudWatch logs for
   `lead-followup-worker` and the DynamoDB `LeadFollowupWork` row by
   `idempotency_key`.

Rules:

- Do not delete `LeadFollowupWork` to force a retry.
- Do not retry a row that has a `sending` channel unless the admin action allows it.
- A manual resolution intentionally stops automation for that work item.

## Scenario F: Wrong language / wrong hours / wrong agent behavior

Language issues:

- Confirm the frontend passed `locale` to session creation.
- Confirm the workflow state variable `locale` exists in the Start block.
- Confirm the agent instructions say "reply in the user's language".

Hours/time issues:

- Confirm the backend passed `shop_*` state variables.
- Confirm the agent instructions explicitly use those values and never guess.
- Confirm shop schedule logic in `chat-session-create/handler.ts` matches reality.

Agent behavior issues:

- If you changed the prompt recently, check Agent Builder history.
- Confirm you did not set the Agent output format to JSON (customer sees `{}`).

## How to safely change X (runbook perspective)

### Prompt changes (Agent Builder)

- Test at least: English, Spanish, Chinese, Arabic (RTL), and "hours" questions.
- Verify no pricing.
- Verify no hallucinated hours/day.
- Verify "one question per message" remains true.

### UI copy changes (site)

- Verify ChatKit options schema does not fail (invalid start prompt icons break UI).
- Verify RTL still looks correct.

### Email template changes (backend)

- Start a new chat thread to test (idempotency blocks old thread re-sends).
- Verify HTML renders correctly in Gmail and mobile.
- Verify tel/mailto/log links are clickable.

### Dedupe timing changes (backend)

- Confirm lease/cooldown values still prevent duplicate sends and retry storms.
- Test pagehide/idle triggers (they can fire multiple times).
