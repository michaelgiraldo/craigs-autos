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
- C) Shop did not receive the lead email
- D) Duplicate lead emails
- E) Wrong language / wrong hours / wrong agent behavior

## Check this first (always)

### 1) Get the ChatKit thread id (cthr_...)

You need the thread id to debug anything.

Ways to get it:

- From the lead email subject:
  - It includes `(cthr_...)`.

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

- `custom.chatkit_session_url`
- `custom.chatkit_lead_email_url`

If these are missing or wrong, the frontend may be calling a placeholder URL.

### 4) Check DynamoDB idempotency record (send once per thread)

The lead email system uses DynamoDB to ensure only one email is sent per `cthr_...`.

Goal:

- Determine whether the backend thinks it already sent.

How to find the table name:

- In AWS Lambda console:
  - Function: `chatkit-lead-email`
  - Configuration -> Environment variables -> `LEAD_DEDUPE_TABLE_NAME`

Once you have the table name, you can query by thread id:

AWS CLI example:

```sh
aws dynamodb get-item \
  --region us-west-1 \
  --table-name "<LEAD_DEDUPE_TABLE_NAME>" \
  --key '{"thread_id":{"S":"cthr_..."} }'
```

Interpretation:

- `status = sent`:
  - The backend believes the email was already sent.
  - Look at `sent_at` and `message_id`.

- `status = sending` and `lock_expires_at` in the future:
  - A send is in progress (or a client died mid-send).
  - Wait ~2 minutes (lease default) and retry.

- `status = error` and `lock_expires_at` in the future:
  - The last send failed and is in cooldown.
  - Check CloudWatch logs for the error.

### 5) Check CloudWatch logs for the Lambda functions

The two main Lambda functions:

- `chatkit-session` (session minting)
- `chatkit-lead-email` (transcript + email)

In AWS Console:

- Lambda -> Functions -> select function -> Monitor -> View logs in CloudWatch

What to search for:

- Session:
  - "ChatKit session create failed"

- Lead email:
  - "Lead email failed"
  - "Lead summary generation failed"
  - "Lead dedupe mark sent failed"
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

- The lead-email Lambda may not be getting invoked, or may be exiting early due to
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
   - Confirm `/amplify_outputs.json` has `custom.chatkit_session_url`.
   - Confirm the Function URL responds to POST from the browser origin (CORS).

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
   - from `/amplify_outputs.json` key `custom.chatkit_session_url`

2) Confirm the session Lambda is configured with:
   - `OPENAI_API_KEY` secret
   - `CHATKIT_WORKFLOW_ID` secret

3) CloudWatch logs for `chatkit-session`:
   - Look for "Server missing configuration"
   - Look for OpenAI API errors

Common fixes:

- Missing secrets: set in Amplify Secrets for the branch/environment.
- Wrong workflow id: update `CHATKIT_WORKFLOW_ID` in Amplify Secrets.
- Workflow deleted/renamed: workflow id is what matters; verify it still exists.

## Scenario C: Shop did not receive the lead email

Symptoms:

- Customer chatted and provided contact info, but no email arrived.

Checks (in order):

1) Get the thread id (`cthr_...`) and open OpenAI logs.
2) Check if the lead-email endpoint was called:
   - Browser DevTools -> Network -> look for POST to `custom.chatkit_lead_email_url`.
3) Check DynamoDB record:
   - If `sent`, the backend believes it sent. Confirm SES delivery.
   - If missing, the endpoint may not have been hit or may have crashed before writing.
4) CloudWatch logs for `chatkit-lead-email`.
5) SES console:
   - look for sends, bounces, or sandbox restrictions.

Common causes:

- Contact info was never captured (backend requires phone or email in CUSTOMER messages).
- Lead email was sent before the customer provided later details (snapshot timing).
- SES sender not verified, or SES sandbox restrictions.
- Lambda errors (OpenAI API failures, parsing failures).

Notes on "handoff_ready":

- `handoff_ready` is produced by the summary model as a convenience field.
- Current send triggers are `idle`, `pagehide`, and `chat_closed` (once contact exists).
- If you see `last_reason = "auto"` in DynamoDB, you're likely looking at an older deployment
  (see `docs/chatkit/lead-email-before-after.md`).

## Scenario D: Duplicate lead emails

Duplicates should not occur because DynamoDB dedupe is keyed by `thread_id`.

If you see duplicates, check:

1) Are the emails for the same `cthr_...`?
   - If different thread ids, they are not duplicates; the user created multiple threads.

2) DynamoDB record history:
   - Verify `status` transitions and `attempts`.

3) Multiple environments:
   - Are two different backends sending (ex: staging + prod)?

Potential causes:

- Dedupe table not configured (LEAD_DEDUPE_TABLE_NAME missing) in that environment.
- A forced re-send happened (table item deleted).

## Scenario E: Wrong language / wrong hours / wrong agent behavior

Language issues:

- Confirm the frontend passed `locale` to session creation.
- Confirm the workflow state variable `locale` exists in the Start block.
- Confirm the agent instructions say "reply in the user's language".

Hours/time issues:

- Confirm the backend passed `shop_*` state variables.
- Confirm the agent instructions explicitly use those values and never guess.
- Confirm shop schedule logic in `chatkit-session/handler.ts` matches reality.

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
