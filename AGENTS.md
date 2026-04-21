# Agent Notes (Craig's Auto Upholstery site)

This file is a long-lived reference for future developers (and coding agents)
working in this repo. It documents "what exists", how to run it, and where to
make changes safely.

This is the canonical copy.

If you are new here, start with:

- `docs/README.md`
- `docs/chatkit/overview.md`
- `docs/amplify-deploy-validation-runtime.md`
- `docs/amplify-backend-pattern-modernization-follow-up.md`

## Repo overview

- Framework: Astro (static site output) with React islands.
- Product: multi-locale website + ChatKit-powered lead intake chat + public contact/quote form.
- Hosting: AWS Amplify (Gen2) for static hosting + one public HTTP API routed to Lambdas.
- Chat/agent: OpenAI ChatKit UI runtime + managed workflow in Agent Builder.
- Lead delivery:
  - form, email, and chat all reserve `LeadFollowupWork`, persist a lead bundle,
    and hand the work to `lead-followup-worker`
  - `lead-followup-worker` owns the first customer response, owner notification,
    QUO SMS, SES customer email, and lead outreach sync
- Reliability:
  - source-specific intake ledgers prevent duplicate source capture
  - first-response idempotency is keyed by `LeadFollowupWork.idempotency_key`
  - worker lease/workflow state is keyed by `LeadFollowupWork.idempotency_key`

## Key documentation

ChatKit docs are split for fast navigation:

- `docs/chatkit/overview.md` (mental model + diagrams)
- `docs/chatkit/frontend.md` (widget embed + triggers + locale copy)
- `docs/chatkit/backend.md` (Amplify Gen2 + Lambda + SES + DynamoDB)
- `docs/chatkit/agent-builder.md` (Agent Builder playbook + common mistakes)
- `docs/chatkit/runbook.md` (production debugging / triage)
- `docs/email-intake.md` (Google Workspace routing + SES inbound email lead intake)

Compatibility pointer:

- `docs/chatkit-aws.md` (pointer to the files above)

Deployment/runtime pointer:

- `docs/amplify-deploy-validation-runtime.md` (Amplify Gen2 deploy-time
  TypeScript validation is separate from Lambda Node runtime compatibility)
- `docs/amplify-backend-pattern-modernization-follow-up.md` (tracks backend
  syntax patterns that can be modernized only after Amplify's deploy compiler
  proves support)

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
- Business identity guardrail: `npm run validate:business-profile`
- Admin production smoke: `LEADS_ADMIN_PASSWORD=... npm run smoke:admin-leads`

Typecheck (backend):

- `npm run typecheck:backend`
- `npm run verify:amplify-deploy-compiler` runs the same installed Amplify
  backend deployer compiler used before `ampx pipeline-deploy`.

Local ChatKit dev API:

- Implemented in `server/chatkit-dev.mjs`
- Session endpoint: `http://localhost:8787/api/chat-sessions/`
- Chat handoff endpoint: `http://localhost:8787/api/chat-handoffs/` (dev_noop; no SES)

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
- `pipeline-deploy` performs Amplify backend TypeScript validation before
  CloudFormation/Lambda deployment. Lambda runtime support does not guarantee
  that Amplify's deploy-time validator will accept the same source. See
  `docs/amplify-deploy-validation-runtime.md` and
  `docs/amplify-backend-pattern-modernization-follow-up.md` before changing
  backend syntax, `amplify/tsconfig.json`, or test placement under
  `amplify/functions`.
- The frontend reads `/amplify_outputs.json` at runtime to discover:
  - `custom.api_base_url`
- Browser code composes stable public API routes from that base URL:
  - `POST /quote-requests`
  - `POST /chat-sessions`
  - `POST /chat-handoffs`
  - `GET /lead-action-links`
  - `POST /lead-interactions`
  - `GET /admin/leads`
  - `POST /admin/leads/qualification`
  - notes and follow-up state routes are intentionally not exposed until their handlers exist

### Business identity source of truth

- Craig's canonical business facts live in `packages/business-profile/src/business-profile.js`.
- Type declarations live in `packages/business-profile/src/business-profile.d.ts`.
- Frontend site metadata, Lambda environment defaults, outreach signatures, and
  QUO source/external-id defaults should derive from this profile.
- Do not hardcode shop name, phone, address, email, domain, map URL, or QUO source
  strings throughout runtime code or copied tests.
- Run `npm run validate:business-profile` after changing business identity,
  lead-delivery defaults, or imported client fixtures.

### Lead event contract source of truth

- Canonical lead event names and metadata live in `packages/contracts/src/lead-event-contract.js`.
- Type declarations live in `packages/contracts/src/lead-event-contract.d.ts`.
- Browser dataLayer events, `/lead-interactions` accepted events, backend journey
  semantics, lifecycle rules, and admin/system event names should derive from
  this contract.
- Do not add ad hoc `lead_*` event strings in frontend or Lambda runtime code.

### Secrets

Amplify Secrets (write-only) must be configured per environment/branch:

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID`
- `LEADS_ADMIN_PASSWORD`

Optional non-secret function environment:

- `MANAGED_CONVERSION_DESTINATIONS` as a comma-separated list such as
  `google_ads,microsoft_ads,meta_ads`; leave empty until feedback destinations are configured.

Do not store these in the frontend or in git.

### SES (email delivery)

- SES must be configured in the same region as the Amplify backend.
- Sender identity must be verified.
- Follow-up defaults live in `amplify/functions/lead-followup-worker/resource.ts`:
  - `CONTACT_TO_EMAIL` / `CONTACT_FROM_EMAIL`
  - `QUOTE_CUSTOMER_*`
- Inbound email intake uses the hidden SES recipient
  `contact-intake@email-intake.craigs.autos`. Google Workspace should copy
  `contact@craigs.autos` mail to that address and stamp:
  - `X-Gm-Original-To: contact@craigs.autos`
  - `X-Craigs-Google-Route: contact-public-intake`
- Email lead auto-replies use `victor@craigs.autos` for `From` and `Reply-To`.
  Raw SES MIME in S3 is transient: explicit delete after processing, with a
  1-day lifecycle rule as backup.

## ChatKit: what to know (fast)

Identifiers:

- Workflow id: `wf_...` (Agent Builder config, stored as `CHATKIT_WORKFLOW_ID`)
- Session id: `cksess_...` (short-lived)
- Thread id: `cthr_...` (canonical conversation id; use this for transcript, dedupe, logs)
- User id: `anon_...` (stable per browser; stored in localStorage)

If you are debugging, always start by getting the thread id (`cthr_...`) and then:

- OpenAI logs: `https://platform.openai.com/logs/cthr_...`
- DynamoDB `LeadFollowupWork` record (`idempotency_key = chat:cthr_...`)
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
  - Change `amplify/functions/chat-session-create/handler.ts` (deploy required).
  - Also update the local mirror in `server/chatkit-dev.mjs`.

- Chat lead handoff / lead capture / idempotency:
  - Change `amplify/functions/chat-handoff-promote/*` and/or `amplify/backend.ts`.
  - Chat handoff evaluates the thread, reserves `LeadFollowupWork`, persists the lead,
    and invokes `lead-followup-worker`.
  - Do not send SES/QUO directly from `chat-handoff-promote`.
  - Shared outreach draft generation lives in `amplify/functions/_lead-platform/services/outreach-drafts.ts`.
  - Generic QUO client code lives in `amplify/functions/_shared/quo-client.ts`.
  - Generic text utilities live in `amplify/functions/_shared/text-utils.ts`.

- Shared lead follow-up workflow:
  - Lambda wrapper lives in `amplify/functions/quote-request-submit/handler.ts`
  - Request parsing lives in `amplify/functions/quote-request-submit/request.ts`
  - Intake validation lives in `amplify/functions/quote-request-submit/validation.ts`
  - Quote submit orchestration lives in `amplify/functions/quote-request-submit/submit-quote-request.ts`
  - AWS runtime wiring lives in `amplify/functions/quote-request-submit/runtime.ts`
  - Follow-up work shape lives in `amplify/functions/_lead-platform/domain/lead-followup-work.ts`
  - Shared follow-up work Dynamo repo lives in `amplify/functions/_lead-platform/repos/dynamo/followup-work.ts`
  - Journey/lead persistence and follow-up sync live in `amplify/functions/_lead-platform/services/followup-work.ts`
  - Async follow-up Lambda wrapper lives in `amplify/functions/lead-followup-worker/handler.ts`
  - Async follow-up orchestration lives in `amplify/functions/lead-followup-worker/process-lead-followup-worker.ts`
  - Follow-up state transitions live in `amplify/functions/lead-followup-worker/workflow.ts`
  - DynamoDB follow-up storage lives in `amplify/functions/lead-followup-worker/followup-work-store.ts`
  - SES/QUO adapters live in `amplify/functions/lead-followup-worker/customer-email.ts`, `owner-email.ts`, and `quo-sms.ts`
  - AWS/OpenAI/env wiring lives in `amplify/functions/lead-followup-worker/runtime.ts`
  - Do not put quote-submit business logic back into `handler.ts`; keep the handler as transport/response mapping
  - Do not put async follow-up business logic back into `lead-followup-worker/handler.ts`; keep the handler as transport/response mapping
  - Do not recreate worker-local lead sync helpers; follow-up outcomes should update lead records through the lead platform service
  - QUO may be intentionally disabled; when that is true, follow-up work should stay in manual follow-up rather than surfacing as SMS failures

- Inbound email intake:
  - Google Workspace setup and runbook live in `docs/email-intake.md`
  - Infra wiring lives in `amplify/backend/email-intake.ts`
  - Lambda wrapper lives in `amplify/functions/email-intake-capture/handler.ts`
  - MIME parsing/photo filtering lives in `amplify/functions/email-intake-capture/mime.ts`
  - OpenAI classification/drafting lives in `amplify/functions/email-intake-capture/evaluation.ts`
  - Intake orchestration lives in `amplify/functions/email-intake-capture/process-email-intake.ts`
  - Email lead bundle construction lives in `amplify/functions/_lead-platform/services/intake-email.ts`
  - Accepted emails reserve `LeadFollowupWork`; they do not create legacy quote queue records
  - Email-first follow-up behavior lives in `amplify/functions/lead-followup-worker/workflow.ts`
  - Threaded customer email lives in `amplify/functions/lead-followup-worker/customer-email.ts`
  - Owner photo attachment loading lives in `amplify/functions/lead-followup-worker/inbound-email-attachments.ts`
  - Do not store extracted photos separately unless a future requirement needs it. The raw S3 MIME object exists only so OpenAI and the owner notification can process photos, then it should be deleted.
  - Do not accept PDFs, documents, ZIPs, or HEIC in v1. Keep attachment processing limited to JPEG, PNG, and WebP.

- Contact form intake / async follow-up:
  - Public intake endpoint: `amplify/functions/quote-request-submit/handler.ts`
  - Async worker: `amplify/functions/lead-followup-worker/handler.ts`
  - Frontend form island: `src/features/quote/components/QuoteRequestForm.tsx`
  - Contact page injection: `src/components/LocalizedPageContent.astro`

- Journey-first lead storage / admin views:
  - Shared substrate: `amplify/functions/_lead-platform/*`
  - Canonical event names and lifecycle metadata live in `/contracts/lead-event-contract`
  - Domain record types are split by ownership:
    - contact identity: `amplify/functions/_lead-platform/domain/contact.ts`
    - journeys: `amplify/functions/_lead-platform/domain/journey.ts`
    - journey events: `amplify/functions/_lead-platform/domain/journey-event.ts`
    - lead records: `amplify/functions/_lead-platform/domain/lead-record.ts`
    - lead action vocabulary: `amplify/functions/_lead-platform/domain/lead-actions.ts`
    - managed conversion decisions, outbox, outcomes, and provider destinations:
      `amplify/functions/_lead-platform/domain/conversion-feedback.ts`
  - Lifecycle rules live in `amplify/functions/_lead-platform/domain/lead-lifecycle.ts`
  - Event semantics live in `amplify/functions/_lead-platform/domain/lead-semantics.ts`
  - Contact identity, journey status, event building, qualification defaults, and merge rules live in named files under `amplify/functions/_lead-platform/services/`
  - Do not recreate catch-all `domain/types.ts` or `services/shared.ts`; add behavior to the owning domain/service module instead
  - Refactor plan and edge-case matrix live in `docs/lead-platform-lifecycle-plan-2026-04-18.md`
  - Admin API wrapper: `amplify/functions/lead-admin-api/handler.ts`
  - Admin auth parsing: `amplify/functions/lead-admin-api/auth.ts`
  - Admin request parsing: `amplify/functions/lead-admin-api/request.ts`
  - Admin list operation: `amplify/functions/lead-admin-api/list-leads.ts`
  - Admin qualification operation: `amplify/functions/lead-admin-api/qualify-lead.ts`
  - Admin AWS/repository wiring: `amplify/functions/lead-admin-api/runtime.ts`
  - Admin conversion-feedback visibility is built from durable decisions, outbox
    items, and outcomes; do not collapse it back to one provider upload flag.
  - Managed conversion feedback contract: `packages/contracts/src/managed-conversion-contract.js`
  - Managed conversion destination bootstrap:
    `amplify/functions/_lead-platform/services/managed-conversion-destinations.ts`
  - Managed conversion config-as-code parser/readiness:
    `amplify/functions/_lead-platform/services/provider-conversion-destination-config.ts`
  - Managed conversion desired-state config:
    `config/managed-conversion-destinations.json`
  - Managed conversion operator CLI:
    `scripts/managed-conversions.ts`
  - Durable managed conversion decision/outbox orchestration:
    `amplify/functions/_lead-platform/services/managed-conversion-feedback.ts`
  - Managed conversion worker state machine:
    `amplify/functions/_lead-platform/services/managed-conversion-feedback-worker.ts`
  - Managed conversion provider SDK/factory:
    `amplify/functions/_lead-platform/services/conversion-feedback/provider-definition.ts`
  - Managed conversion provider config manifest:
    `amplify/functions/_lead-platform/services/conversion-feedback/provider-config-manifest.ts`
  - Managed conversion provider adapter registry:
    `amplify/functions/_lead-platform/services/conversion-feedback/adapter-registry.ts`
  - Shared provider adapter types, config helpers, HTTP helpers, and identity normalization:
    `amplify/functions/_lead-platform/services/conversion-feedback/`
  - Provider adapters:
    `amplify/functions/_lead-platform/services/conversion-feedback/providers/google-ads/`
    `amplify/functions/_lead-platform/services/conversion-feedback/providers/yelp/`
    `amplify/functions/_lead-platform/services/conversion-feedback/providers/manual/`
  - To add a new paid provider, add the destination key to the contract first,
    then add provider config fields, a provider `definition.ts`, the small
    adapter wrapper, provider-specific payload/client tests, and provider SDK
    conformance coverage. Do not hand-copy disabled/dry-run/live-config
    branching into each provider adapter.
  - Scheduled managed conversion worker Lambda:
    `amplify/functions/managed-conversion-feedback-worker/handler.ts`
  - Architecture note: `docs/managed-conversions-architecture-2026-04-19.md`
  - Operator runbook: `docs/managed-conversions-ops.md`
  - Google Ads is a managed-conversion destination, not lead truth. Do not add provider upload
    booleans to `LeadQualificationSnapshot`. `validated` means the payload was built locally or
    provider test mode passed; it does not mean a live ad platform attributed the conversion.
  - Do not build provider setup as admin UI by default. Provider destination setup belongs in
    config/CLI/docs/automation; the admin UI is for lead-specific business decisions.
  - Admin page layout: `src/layouts/AdminLayout.astro`
  - Admin page script: `src/scripts/admin-leads.ts`
  - Admin build isolation guard: `scripts/guard-admin-build.mjs`
  - Admin browser smoke script: `scripts/smoke-admin-leads.mjs`
  - Admin pages must not use `src/layouts/BaseLayout.astro`; the public layout includes marketing navigation, lead capture widgets, and public lead-tracking scripts by default

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

### Update follow-up email templates

- Customer email: `amplify/functions/lead-followup-worker/customer-email.ts`
- Owner email: `amplify/functions/lead-followup-worker/owner-email.ts`
- Shared owner content: `amplify/functions/lead-followup-worker/email-content.ts`
- Keep both HTML and text paths readable in Gmail desktop + mobile.
- Test with a new `idempotency_key`; completed work is intentionally idempotent.

### Update quote request intake or lead follow-up

- Edit:
  - public intake validation: `amplify/functions/quote-request-submit/validation.ts`
  - public request parsing: `amplify/functions/quote-request-submit/request.ts`
  - quote submit orchestration / queueing: `amplify/functions/quote-request-submit/submit-quote-request.ts`
  - Lambda response mapping only: `amplify/functions/quote-request-submit/handler.ts`
  - customer/shop follow-up orchestration: `amplify/functions/lead-followup-worker/process-lead-followup-worker.ts`
  - customer/shop follow-up workflow transitions: `amplify/functions/lead-followup-worker/workflow.ts`
  - follow-up delivery adapters: `amplify/functions/lead-followup-worker/customer-email.ts`, `owner-email.ts`, `quo-sms.ts`
  - frontend fields / quote request UX: `src/features/quote/components/quote-request-form/*`
- Run:
  - `npm run typecheck:backend`
  - `npm run test:backend`
  - `npm run typecheck:web`
  - `npm run build`
  - `npm run build:release` if the change affects release-generated social assets
- Validate:
  - form submit creates a `LeadFollowupWork` item keyed by `idempotency_key`
  - `LeadFollowupWork` moves `queued -> processing -> completed|error`
  - owner email is sent
  - journey / lead record updates appear in admin

### Change follow-up idempotency timing (lease/ttl)

- Edit:
  - `LEAD_FOLLOWUP_LEASE_SECONDS` in `amplify/functions/lead-followup-worker/process-lead-followup-worker.ts`
  - `LEAD_FOLLOWUP_WORK_TTL_DAYS` in `amplify/functions/_lead-platform/domain/lead-followup-work.ts`
- Validate:
  - no duplicate first responses for the same source event
  - errors do not cause retry storms

### Change triggers (idle/pagehide/close)

- Edit: `src/components/ChatWidgetReact.jsx`
- Keep reason strings stable if possible:
  - `idle`, `pagehide`, `chat_closed`
- Confirm behavior:
  - `idle` fires after a quiet period (timer resets on in-chat activity)
  - backend enqueues follow-up work once contact exists and readiness gates pass
  - DynamoDB enforces one first-response work item per `chat:cthr_...` idempotency key

## Security and privacy

- Never commit `.env.local` or any secrets.
- Do not paste live API keys into issues, logs, or commits.
- Treat transcripts and lead notification emails as containing PII.
- Avoid logging full transcripts in CloudWatch.

## Git / workflow notes

- Amplify deploys are triggered by commit + push to a connected branch.
- Agent Builder workflow changes apply immediately (if `CHATKIT_WORKFLOW_ID` stays the same).
- Prefer small, reviewable commits for infra/backend changes.
