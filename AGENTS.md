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
- Product: multi-locale website + ChatKit-powered lead intake chat + public contact/quote form.
- Hosting: AWS Amplify (Gen2) for static hosting + one public HTTP API routed to Lambdas.
- Chat/agent: OpenAI ChatKit UI runtime + managed workflow in Agent Builder.
- Lead delivery:
  - chat: AWS SES transcript + internal AI summary to the shop
  - form: quote submission queue + async follow-up worker
- Reliability:
  - chat idempotency keyed by ChatKit thread id (`cthr_...`)
  - form idempotency / workflow state keyed by `submission_id`

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
- Build site only: `npm run build`
- Build release assets + site: `npm run build:release`

Typecheck (backend):

- `npx tsc -p amplify/tsconfig.json --noEmit`

Local ChatKit dev API:

- Implemented in `server/chatkit-dev.mjs`
- Session endpoint: `http://localhost:8787/api/chat/session`
- Chat lead handoff endpoint: `http://localhost:8787/api/chat/handoff` (dev_noop; no SES)

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
  - `custom.api_base_url`
- Browser code composes stable public API routes from that base URL:
  - `POST /contact`
  - `POST /chat/session`
  - `POST /chat/handoff`
  - `GET /chat/message-link`
  - `POST /lead-signal`
  - `GET|POST /admin/leads`

### Secrets

Amplify Secrets (write-only) must be configured per environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`

Do not store these in the frontend or in git.

### SES (email delivery)

- SES must be configured in the same region as the Amplify backend.
- Sender identity must be verified.
- Defaults live in `amplify/functions/chat-lead-handoff/resource.ts`:
  - `LEAD_TO_EMAIL` (recipient, default `leads@craigs.autos`)
  - `LEAD_FROM_EMAIL` (sender, default `leads@craigs.autos`)
- Quote follow-up defaults live in `amplify/functions/quote-followup/resource.ts`:
  - `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`
  - `QUOTE_CUSTOMER_*`

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

- Standalone quote page / quote funnel copy:
  - Change `src/features/quote/components/QuotePage.astro`
  - CTA from contact pages lives in `src/features/quote/components/QuotePageCta.astro`
  - Locale-specific helper copy lives in `src/lib/site-data/quote-page-copy.js`
  - Localized routes/frontmatter live under `src/content/pages/*/request-a-quote.mdx`

- Chat widget behavior (triggers, runtime loading, theme):
  - Change `src/components/ChatWidgetReact.jsx` (deploy required).

- Session minting / state variables:
  - Change `amplify/functions/chatkit-session/handler.ts` (deploy required).
  - Also update the local mirror in `server/chatkit-dev.mjs`.

- Chat lead handoff / notification email / idempotency:
  - Change `amplify/functions/chat-lead-handoff/*` and/or `amplify/backend.ts`.

- Quote form follow-up workflow:
  - Change `amplify/functions/contact-submit/handler.ts`
  - Quote request record shape lives in `amplify/functions/_lead-core/domain/quote-request.ts`
  - Journey/lead persistence and follow-up sync live in `amplify/functions/_lead-core/services/quote-request.ts`
  - Async follow-up lives in `amplify/functions/quote-followup/*`
  - Do not recreate worker-local lead sync helpers; follow-up outcomes should update lead records through the shared lead-core service
  - QUO may be intentionally disabled; when that is true, submissions should stay in manual follow-up rather than surfacing as SMS failures

- Contact form intake / async follow-up:
  - Public intake endpoint: `amplify/functions/contact-submit/handler.ts`
  - Async worker: `amplify/functions/quote-followup/handler.ts`
  - Frontend form island: `src/features/quote/components/QuoteRequestForm.tsx`
  - Contact page injection: `src/components/LocalizedPageContent.astro`

- Journey-first lead storage / admin views:
  - Shared substrate: `amplify/functions/_lead-core/*`
  - Domain record types are split by ownership:
    - contact identity: `amplify/functions/_lead-core/domain/contact.ts`
    - journeys: `amplify/functions/_lead-core/domain/journey.ts`
    - journey events: `amplify/functions/_lead-core/domain/journey-event.ts`
    - lead records: `amplify/functions/_lead-core/domain/lead-record.ts`
    - lead action vocabulary: `amplify/functions/_lead-core/domain/lead-actions.ts`
  - Lifecycle rules live in `amplify/functions/_lead-core/domain/lead-lifecycle.ts`
  - Event semantics live in `amplify/functions/_lead-core/domain/lead-semantics.ts`
  - Contact identity, journey status, event building, qualification defaults, and merge rules live in named files under `amplify/functions/_lead-core/services/`
  - Do not recreate catch-all `domain/types.ts` or `services/shared.ts`; add behavior to the owning domain/service module instead
  - Refactor plan and edge-case matrix live in `docs/lead-platform-lifecycle-plan-2026-04-18.md`
  - Admin API: `amplify/functions/chatkit-lead-admin/handler.ts`
  - Admin page script: `src/scripts/admin-leads.ts`

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
- Run: `npm run validate:content && npm run build`
- Smoke test: `en`, `es`, `zh-hans`, `ar` (RTL)

### Update email template

- Edit: `amplify/functions/chat-lead-handoff/email-delivery.ts` (`sendTranscriptEmail`)
- Keep both:
  - HTML readable in Gmail desktop + mobile
  - text version useful for quick scanning
- Test with a NEW thread id (idempotency blocks re-sends for old threads).

### Update contact form or quote follow-up

- Edit:
  - public intake validation / queueing: `amplify/functions/contact-submit/handler.ts`
  - customer/shop follow-up workflow: `amplify/functions/quote-followup/*`
  - frontend fields / submission UX: `src/features/quote/components/quote-request-form/*`
- Run:
  - `npm run typecheck:backend`
  - `npm run test:backend`
  - `npm run typecheck:web`
  - `npm run build`
  - `npm run build:release` if the change affects release-generated social assets
- Validate:
  - form submit creates a `submission_id`
  - `QuoteSubmissionTable` record moves `queued -> processing -> completed|error`
  - owner email is sent
  - journey / lead record updates appear in admin

### Change idempotency timing (lease/cooldown/ttl)

- Edit constants in `amplify/functions/chat-lead-handoff/handler.ts`:
  - `LEAD_DEDUPE_LEASE_SECONDS`
  - `LEAD_DEDUPE_ERROR_COOLDOWN_SECONDS`
  - `LEAD_DEDUPE_TTL_DAYS`
- Validate:
  - no duplicate handoffs/emails for the same `cthr_...`
  - errors do not cause retry storms

### Change triggers (idle/pagehide/close)

- Edit: `src/components/ChatWidgetReact.jsx`
- Keep reason strings stable if possible:
  - `idle`, `pagehide`, `chat_closed`
- Confirm behavior:
  - `idle` fires after a quiet period (timer resets on in-chat activity)
  - backend completes handoff once contact exists and readiness gates pass
  - DynamoDB enforces "complete once per thread"

## Security and privacy

- Never commit `.env.local` or any secrets.
- Do not paste live API keys into issues, logs, or commits.
- Treat transcripts and lead notification emails as containing PII.
- Avoid logging full transcripts in CloudWatch.

## Git / workflow notes

- Amplify deploys are triggered by commit + push to a connected branch.
- Agent Builder workflow changes apply immediately (if `CHATKIT_WORKFLOW_ID` stays the same).
- Prefer small, reviewable commits for infra/backend changes.
