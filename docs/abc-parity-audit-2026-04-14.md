# ABC Feature Parity Audit

- Date: 2026-04-14
- Scope: Craig's website repo + Craig's marketing-ops repo, compared against ABC website repo, ABC marketing-ops repo, and the shared V3 notes in `/Users/mg/Active_Clients/_shared/lead-platform-v3`
- Audit basis: local source code, local docs, and saved reports only
- Not yet verified live: AWS resources, Amplify secrets, GTM container inventory, GA4 dimensions/events, Lambda env, or current production table contents

Status update, 2026-04-16:

- This audit is historical context for the parity decision.
- Craig's backend has since adopted the journey-first substrate (`Journey`, `JourneyEvent`, `LeadRecord`, `LeadContact`, `LeadActionToken`, `QuoteSubmission`).
- The old flat `ChatkitLeadCasesTable` / `ChatkitLeadEventsTable` resources are retired from the active backend contract.
- Remaining Google/marketing-ops gaps should be evaluated against the journey-first contract, not the old `lead_cases` model.

## Executive Summary

At the time of this audit, Craig's was not missing only a form endpoint. It was on an older lead model.

ABC is already using the stronger journey-first platform:

- `Journey`
- `JourneyEvent`
- `LeadRecord`
- `LeadContact`
- `LeadActionToken`
- `QuoteSubmission`

At the time of this audit, Craig's still used the older ChatKit-specific structure:

- lead event log
- flat `lead_cases`
- chat-led handoff flow

That means "add form submission" should not be implemented as a one-off write into the current Craig's `lead_cases` table. If we do that, we will create another partial fork and still fail parity with ABC.

The correct first milestone is:

1. adopt the ABC/V3 journey contract in Craig's backend
2. wire journey-aware frontend attribution
3. add the form UX and `contact-submit` flow on top of that
4. then update GTM, GA4, and Google Ads reporting to the same event contract

## What ABC Has That Craig's Does Not

### 1. Backend lead model

ABC backend provisions and uses:

- `LeadJourneysTable`
- `LeadJourneyEventsTable`
- `LeadRecordsTable`
- `LeadContactsTable`
- `LeadActionTokensTable`
- `QuoteSubmissionTable`
- `contact-submit` Lambda
- `quote-followup` Lambda
- shared `_lead-core` domain/services

At the time of this audit, Craig's backend provisioned and used:

- `ChatkitLeadEventsTable`
- `ChatkitLeadCasesTable`
- `ChatkitLeadDedupeTable`
- `ChatkitMessageLinkTokenTable`
- ChatKit-only Lambdas

Practical impact:

- ABC can promote a form submit or successful chat handoff into a canonical lead record.
- Craig's can log soft click/chat outcomes, but it does not yet have the canonical journey/lead-record substrate needed for form parity.

Primary source files:

- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/amplify/backend.ts`
- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/amplify/functions/_lead-core/domain/types.ts`
- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/amplify/functions/contact-submit/handler.ts`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/Website/amplify/backend.ts`

### 2. Form capture flow

ABC already has:

- a frontend contact/quote page component
- a `contact-submit` public API
- `journey_id` and `client_event_id` passed from browser to backend
- server-side validation
- lead bundle persistence
- async quote follow-up invocation
- success/error analytics events for forms
- a smoke-test mode that persists data without sending outreach

Craig's currently has:

- no form/contact submission UI in `src/`
- no `contact-submit` Lambda
- no quote follow-up worker
- no form event taxonomy in the website repo

Primary source files:

- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/src/views/ContactPage.tsx`
- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/amplify/functions/contact-submit/handler.ts`
- Craig's `src/pages/` currently has no contact/quote page or form workflow

### 3. Frontend attribution and journey identity

ABC frontend already exposes:

- `getJourneyId()`
- browser attribution helpers built around a shared contract
- `journey_id`, `client_event_id`, `occurred_at_ms`, `user_id`
- structured `dataLayer` payloads aligned with the backend model

Craig's frontend currently has attribution capture, but not the full parity contract:

- `src/lib/attribution.js` does not expose a journey id
- click tracking does not send `journey_id` or `client_event_id`
- chat tracking still includes legacy/extra UI events such as:
  - `lead_chat_panel_opened`
  - `lead_chat_thread_started`
- Craig's does not currently have the form submission event contract at all

Primary source files:

- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/src/lib/attribution.ts`
- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/src/scripts/analytics/events.ts`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/Website/src/lib/attribution.js`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/Website/src/scripts/analytics/events.ts`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/Website/src/components/ChatWidgetReact.jsx`

### 4. Chat event semantics

ABC/V3 contract treats the first retained chat milestone as:

- `lead_chat_first_message_sent`

Craig's older tracking/docs still center on:

- `lead_chat_open`
- `lead_chat_lead_sent`
- `lead_chat_lead_skipped`
- `lead_chat_panel_opened`
- `lead_chat_thread_started`

Practical impact:

- Craig's Google setup and reporting are still optimized for chat UI exposure and immediate handoff responses, not for the cleaner journey-first customer-action model used by ABC.
- If we want true parity, Craig's GTM/GA4 scripts and docs need to move to the ABC event taxonomy, not keep the older chat naming.

Primary source files:

- ABC manifest: `/Users/mg/Active_Clients/ABC_Autos_Accounts/marketing-ops/config/google-measurement-manifest.json`
- Craig's reports/docs: `/Users/mg/Active_Clients/Craigs_Autos_Account/marketing-ops/analytics/phase1_readiness_report_latest.md`
- Craig's docs: `/Users/mg/Active_Clients/Craigs_Autos_Account/marketing-ops/docs/08_TRACKING_EVENT_SEMANTICS.md`

### 5. Admin and qualification workflow

ABC admin tooling is built around:

- lead records
- journeys
- qualification updates that also append journey events

At the time of this audit, Craig's admin tooling was built around:

- a flat `lead_cases` table
- direct qualification toggles on `lead_id`

Practical impact:

- Craig's admin UI can support the older offline conversion flow, but it is not yet aligned with the canonical journey/lead-record model that form parity requires.

Primary source files:

- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/Website/amplify/functions/chat-lead-admin/handler.ts`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/Website/amplify/functions/chatkit-lead-admin/handler.ts`

### 6. Measurement operations and verification

ABC marketing-ops already has:

- a measurement manifest
- GTM phase-one apply script
- GA4 custom-dimension apply script
- GA4 conversion-event apply script
- tracking-health audit against the journey event table
- a live-safe `journey_smoke_test.py`
- current reports for readiness, tracking health, and journey smoke

At the time of this audit, Craig's marketing-ops had:

- older phase-one tracking automation
- no measurement manifest equivalent
- no journey smoke test
- reports still framed around older chat events and `lead_cases`

Practical impact:

- even if the website/backend were upgraded, Craig's Google-side tooling would still lag until the marketing-ops repo is also updated to the ABC/V3 contract

Primary source files:

- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/marketing-ops/config/google-measurement-manifest.json`
- ABC: `/Users/mg/Active_Clients/ABC_Autos_Accounts/marketing-ops/analytics/journey_smoke_test.py`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/marketing-ops/analytics/phase1_tracking_apply.py`
- Craig's: `/Users/mg/Active_Clients/Craigs_Autos_Account/marketing-ops/analytics/weekly_tracking_health_audit.py`

## What This Means For Form Submission

If the goal is "feature parity with ABC," the form submission feature should be treated as a journey-promotion feature, not just a contact endpoint.

Minimum backend prerequisites before form parity is real:

- create the journey-first tables in Craig's AWS account
- port or extract the ABC `_lead-core` runtime/services
- add `contact-submit`
- add `quote-followup`
- make the form persist:
  - journey
  - journey event
  - lead record
  - contact
- expose the new public endpoint in Amplify outputs
- add a smoke-test-safe execution path

Minimum frontend prerequisites:

- add journey id support to Craig's attribution layer
- pass `journey_id`, `client_event_id`, and attribution into the form submit request
- add form submit success/error `dataLayer` events
- update click and chat tracking to the shared event contract

Minimum Google/measurement prerequisites:

- update GTM triggers and GA4 event tags to the ABC event names
- register the missing GA4 custom dimensions
- set intended conversion events
- update reporting scripts to read the journey-first taxonomy

## Recommended Rollout Order

### Phase 0: Confirm target contract

Use ABC as the implementation reference and V3 as the architecture target.

Decision:

- Do not add a new Craig's-only form flow on top of `lead_cases`.
- Migrate Craig's toward ABC's journey-first model first.

### Phase 1: Backend foundation in Craig's AWS

Port or extract from ABC:

- `_lead-core`
- `contact-submit`
- `quote-followup`
- new Dynamo tables and indexes
- admin API updates

Success criteria:

- Craig's backend can persist a form submit as journey + event + lead record + contact
- Craig's chat flow can gradually move onto the same lead model

### Phase 2: Frontend parity

Port or adapt from ABC:

- journey-aware attribution helpers
- form UI/page
- form analytics
- updated click analytics
- updated chat first-message tracking

Success criteria:

- browser payload shape matches ABC for form/click/chat
- no legacy-only chat events remain in the active measurement contract unless explicitly retained

### Phase 3: Google tracking parity

Port or adapt from ABC marketing-ops:

- measurement manifest
- GTM phase-one apply logic
- GA4 dimension and conversion setup
- tracking health audit
- journey smoke test

Success criteria:

- GTM/GA4 inventory matches the new contract
- Craig's reports stop depending on legacy-only chat event names

### Phase 4: Live verification

After AWS and Google access are available:

- inspect live Amplify outputs and Lambda env
- verify current tables and secrets
- run build/typecheck/tests
- run live-safe journey smoke checks
- validate GTM Preview, GA4 DebugView, and backend persistence together

## Access Needed For The Next Audit Pass

To move from static audit to implementation-ready migration plan, we still need:

- Craig's AWS access
- current Amplify environment / branch mapping
- current Lambda env vars / secrets inventory
- current Dynamo table names in the active environment
- GTM access for Craig's
- GA4 Admin access for Craig's

## Recommendation

Treat the first deliverable as:

`Craig's journey-first backend foundation + form intake parity plan`

not:

`add a simple form endpoint`

That sequencing is the only path that avoids redoing the work again when we later bring Google tracking, admin qualification, and offline conversion workflows into parity with ABC.
