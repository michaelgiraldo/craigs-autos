# ChatKit lead intake - Agent Builder playbook

This doc is a practical, step-by-step guide to maintaining the managed ChatKit
workflow in OpenAI Agent Builder.

Important: changes in Agent Builder apply immediately (no deploy) as long as the
site continues using the same workflow id (`wf_...`) stored in Amplify as
`CHATKIT_WORKFLOW_ID`.

Related docs:

- Overview: `docs/chatkit/overview.md`
- Backend wiring: `docs/chatkit/backend.md`
- Frontend widget: `docs/chatkit/frontend.md`

## Where Agent Builder lives

- Agent Builder UI:
  https://platform.openai.com/agent-builder

- Domain allowlist (production requirement):
  https://platform.openai.com/settings/organization/security/domain-allowlist

- Logs for a specific thread (debugging):
  https://platform.openai.com/logs/cthr_...

## Naming conventions (recommended)

Pick names that make logs and emails obvious:

- Workflow name: "Craig's Auto Upholstery - Lead Intake (ChatKit)"
- Agent name: "Roxana (Lead Intake)"

These names are for humans; the system uses the workflow id (`wf_...`).

## Model choice

Current approach:

- Use `gpt-5.2-chat-latest` for the ChatKit agent.

Why:

- You get improvements automatically without reconfiguring the workflow.

Tradeoff:

- Behavior can drift over time. For higher stability, pin a dated model if/when
  OpenAI publishes date-pinned ids for this family.

## Create or edit the workflow (high level)

1) Open Agent Builder: https://platform.openai.com/agent-builder
2) Create a new workflow (or open the existing one).
3) Set the Agent node's:
   - name
   - model
   - instructions
4) Ensure state variables exist in the Start block.
5) Save, then copy the workflow id (`wf_...`).

To point the website at a new workflow:

- Update the Amplify Secret `CHATKIT_WORKFLOW_ID` and redeploy.

## State variables (Start block)

This repo expects the backend to pass these state variables when creating a session:

- `locale` (string)
- `page_url` (string)

Shop time variables (computed server-side):

- `shop_timezone` (string) ex: America/Los_Angeles
- `shop_local_weekday` (string) ex: Sunday
- `shop_local_time_24h` (string) ex: 16:05
- `shop_is_open_now` (boolean)
- `shop_next_open_day` (string)
- `shop_next_open_time` (string) ex: 8:00 AM

Why:

- The agent should not guess day/time/hours. It should use these values.

If you add a new state variable in Agent Builder:

1) Add it to the workflow Start block.
2) Add it to the session minting backend response in:
   - `amplify/functions/chatkit-session/handler.ts`
   - `server/chatkit-dev.mjs` (local dev mirror)
3) Update docs.

## Agent instructions (production checklist)

Good lead-intake instructions for this business should do all of the following:

- Keep a conversational tone (service advisor vibe).
- Ask one question per message.
- Capture project details (what/where/wear/damage).
- Capture vehicle info (year/make/model).
- Capture location and timeline.
- Capture contact info when it is natural (name first, then phone or email).
- Never provide pricing/ranges.
- Provide shop phone/address/hours only when contextually relevant (not dumped up front).
- Handle non-auto upholstery politely without promising acceptance (auto is primary).
- If asked about "today / Sunday / hours", use the shop state variables and be consistent.

Keep the instructions short enough that the model can follow them reliably, but
explicit enough to prevent hallucinated hours/pricing.

## Guardrails: what to enable and what to avoid

This chat is lead intake. Capturing contact info is the point.

Recommendations:

- Enable safety/malicious input checks (moderation/jailbreak/prompt injection).
- Do NOT block PII, because email/phone are required for the lead.

If you use a "Custom Prompt Check" guardrail:

- Make sure it allows upholstery-related lead intake, including email/phone.
- Avoid overfitting it so it blocks normal messages like "full seat" or an email address.

## Common mistakes (and how to fix them)

### 1) Agent output format set to JSON -> customer sees "{}"

Symptom:

- The chat UI shows `{}` as the assistant response.

Cause:

- The Agent node output format was set to JSON.

Fix:

- In the Agent node settings, set output format to "Text" (or default chat output).

### 2) Chat shows "Thought for ..." or internal task text to customers

Symptom:

- Customers see "Thought for 4s" or internal work like "Determining the day".

Cause (typical):

- The workflow includes nodes that create visible tasks/tool calls, or the agent
  is configured to surface internal reasoning/task content.

Fix:

- Keep the workflow simple for a customer-facing chat:
  - Start -> Agent -> End
- Avoid adding tool nodes unless you truly need them.
- Avoid workflows that emit intermediate "task" items to the chat UI.

Note:

- The repo tries to keep the UI clean by relying on ChatKit UI and avoiding tool calls.

### 3) Domain allowlist blocking production

Symptom:

- Chat works on localhost but not on `https://chat.craigs.autos`.

Cause:

- Domain allowlist missing the production domain.

Fix:

- Add `chat.craigs.autos` (and `craigs.autos` if needed) in:
  https://platform.openai.com/settings/organization/security/domain-allowlist

### 4) Over-aggressive guardrails block normal lead messages

Symptom:

- The workflow fails guardrails for normal inputs like "full seat" or an email.

Cause:

- A custom guardrail prompt is too strict or confidence threshold is too low/high.

Fix:

- Loosen the custom guardrail language to include lead intake.
- Avoid guardrails that treat contact info as irrelevant.

## How to test workflow changes safely

Use a minimal testing matrix before "shipping" a prompt change:

1) English lead intake happy path:
   - "seat repair" -> collect vehicle -> collect name -> collect phone/email
2) Non-English locale:
   - test Spanish (es) and Chinese (zh-hans) for language switching
3) Time/hours correctness:
   - ask "what day is today" and "are you open now"
4) Out-of-scope question:
   - ensure it politely redirects back to upholstery intake
5) Pricing request:
   - ensure it refuses pricing and asks for photos/details

When you test "hours", make sure the agent uses:

- `shop_local_weekday`
- `shop_is_open_now`
- `shop_next_open_day` / `shop_next_open_time`

and does not invent hours.

## Screenshots (placeholders)

We keep image placeholders in `docs/chatkit/images/`. Add screenshots when you
have time (they are optional but helpful).

- Agent node settings:
  `docs/chatkit/images/agent-node-settings.png`

- Start block state variables:
  `docs/chatkit/images/start-block-state-variables.png`

- Workflow settings (workflow id location):
  `docs/chatkit/images/workflow-settings-id.png`

Markdown examples (these images may not exist yet):

```
![Agent node settings](./images/agent-node-settings.png)
![Start block variables](./images/start-block-state-variables.png)
![Workflow id](./images/workflow-settings-id.png)
```

