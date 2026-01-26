# Agent Notes (Craig's Auto Upholstery site)

This file is a long-lived reference for future developers (and coding agents)
working in this repo. It documents "what exists", how to run it, and where to
make changes safely.

This is the canonical copy.

If you are new here, start with:

- `docs/README.md`
- `docs/chatkit/overview.md`

## Repo overview

- Framework: Astro (static site output) with React islands.
- Product: multi-locale website + ChatKit-powered lead intake chat.
- Hosting: AWS Amplify (Gen2) for static hosting + backend (Lambda Function URLs).
- Chat/agent: OpenAI ChatKit UI runtime + managed workflow in Agent Builder.
- Lead delivery: AWS SES emails transcript + internal AI summary to the shop.
- Reliability: server-side idempotency keyed by ChatKit thread id (`cthr_...`) in DynamoDB.

## Key documentation

ChatKit docs are split for fast navigation:

- `docs/chatkit/overview.md` (mental model + diagrams)
- `docs/chatkit/frontend.md` (widget embed + triggers + locale copy)
- `docs/chatkit/backend.md` (Amplify Gen2 + Lambda + SES + DynamoDB)
- `docs/chatkit/agent-builder.md` (Agent Builder playbook + common mistakes)
- `docs/chatkit/runbook.md` (production debugging / triage)

Legacy link:

- `docs/chatkit-aws.md` (pointer to the files above)

## Local development

### Prereqs

- Node: modern Node is required (Amplify currently builds with Node 25).
- Do not use `sudo npm ...` locally. If you hit permissions errors, fix ownership
  of the repo's `node_modules/` rather than installing as root.

### Environment

Create `.env.local` at the repo root (never commit it):

```
OPENAI_API_KEY=sk-...
CHATKIT_WORKFLOW_ID=wf_...
```

### Commands

- Install: `npm ci`
- Run site only: `npm run dev` (Astro only)
- Run site + local ChatKit dev API: `npm run dev:local`
- Build: `npm run build`

Typecheck (backend):

- `npx tsc -p amplify/tsconfig.json --noEmit`

Local ChatKit dev API:

- Implemented in `server/chatkit-dev.mjs`
- Session endpoint: `http://localhost:8787/api/chatkit/session`
- Lead endpoint: `http://localhost:8787/api/chatkit/lead` (dev_noop; no SES)

## Production configuration

### OpenAI

- Managed workflow is configured in Agent Builder:
  - https://platform.openai.com/agent-builder
- Production domains must be allowlisted:
  - https://platform.openai.com/settings/organization/security/domain-allowlist
  - at minimum: `chat.craigs.autos` (and `craigs.autos` if embedded there too)

### AWS Amplify (Gen2)

- Builds run via `amplify.yml`.
- The build step runs `npx ampx pipeline-deploy` to:
  - deploy/update the Gen2 backend for the branch
  - generate `public/amplify_outputs.json` with branch-specific endpoints
- The frontend reads `/amplify_outputs.json` at runtime to discover:
  - `custom.chatkit_session_url`
  - `custom.chatkit_lead_email_url`

### Secrets

Amplify Secrets (write-only) must be configured per environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`

Do not store these in the frontend or in git.

### SES (email delivery)

- SES must be configured in the same region as the Amplify backend.
- Sender identity must be verified.
- Defaults live in `amplify/functions/chatkit-lead-email/resource.ts`:
  - `LEAD_TO_EMAIL` (recipient, default `victor@craigs.autos`)
  - `LEAD_FROM_EMAIL` (sender, default `victor@craigs.autos`)

## ChatKit: what to know (fast)

Identifiers:

- Workflow id: `wf_...` (Agent Builder config, stored as `CHATKIT_WORKFLOW_ID`)
- Session id: `cksess_...` (short-lived)
- Thread id: `cthr_...` (canonical conversation id; use this for transcript, dedupe, logs)
- User id: `anon_...` (stable per browser; stored in localStorage)

If you are debugging, always start by getting the thread id (`cthr_...`) and then:

- OpenAI logs: `https://platform.openai.com/logs/cthr_...`
- DynamoDB dedupe record (keyed by `thread_id = cthr_...`)
- CloudWatch logs for the Lambda functions

## Where to make changes (rule of thumb)

- Agent behavior (tone, question strategy, language behavior):
  - Change in Agent Builder (no deploy required if the workflow id stays the same).
  - See `docs/chatkit/agent-builder.md`.

- UI copy and start prompts per locale:
  - Change `CHAT_COPY` in `src/lib/site-data.js` (deploy required).
  - Note: invalid ChatKit `icon` values can break the chat UI.

- Chat widget behavior (triggers, runtime loading, theme):
  - Change `src/components/ChatWidgetReact.jsx` (deploy required).

- Session minting / state variables:
  - Change `amplify/functions/chatkit-session/handler.ts` (deploy required).
  - Also update the local mirror in `server/chatkit-dev.mjs`.

- Lead email logic / template / idempotency:
  - Change `amplify/functions/chatkit-lead-email/handler.ts` and/or `amplify/backend.ts`.

## Safe change checklists (common tasks)

### Update Agent Builder prompt safely

- Test:
  - lead intake happy path (seat/headliner/top)
  - non-English locale (es, zh-hans)
  - hours/day question (agent should use shop time variables, not guess)
  - pricing request (must refuse)
- Avoid:
  - Agent output format set to JSON (customers will see `{}`)
  - workflows that surface internal tasks like "Thought for ..." to customers

### Update chat UI copy per locale

- Edit: `src/lib/site-data.js` (`CHAT_COPY`)
- Run: `npm run build`
- Smoke test: `en`, `es`, `zh-hans`, `ar` (RTL)

### Update email template

- Edit: `amplify/functions/chatkit-lead-email/handler.ts` (`sendTranscriptEmail`)
- Keep both:
  - HTML readable in Gmail desktop + mobile
  - text version useful for quick scanning
- Test with a NEW thread id (idempotency blocks re-sends for old threads).

### Change idempotency timing (lease/cooldown/ttl)

- Edit constants in `amplify/functions/chatkit-lead-email/handler.ts`:
  - `LEAD_DEDUPE_LEASE_SECONDS`
  - `LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS`
  - `LEAD_DEDUPE_TTL_DAYS`
- Validate:
  - no duplicate emails for the same `cthr_...`
  - errors do not cause retry storms

### Change triggers (auto/idle/pagehide/close)

- Edit: `src/components/ChatWidgetReact.jsx`
- Keep reason strings stable if possible:
  - `auto`, `idle`, `pagehide`, `chat_closed`
- Confirm backend gating:
  - `auto` only sends when `handoff_ready === true`
  - other reasons send when contact exists

## Security and privacy

- Never commit `.env.local` or any secrets.
- Do not paste live API keys into issues, logs, or commits.
- Treat transcripts and lead emails as containing PII.
- Avoid logging full transcripts in CloudWatch.

## Git / workflow notes

- Amplify deploys are triggered by commit + push to a connected branch.
- Agent Builder workflow changes apply immediately (if `CHATKIT_WORKFLOW_ID` stays the same).
- Prefer small, reviewable commits for infra/backend changes.
