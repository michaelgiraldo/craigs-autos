# Clean-Slate Rewrite Spec

- Date: 2026-04-14
- Status: approved direction
- Scope: Craig's website repo only
- Priority: optimize for developer experience and production quality, not incremental shipping

## Decision

We should replace the current quote/contact/lead implementation with a clean-slate architecture inside the existing multilingual Astro site framework.

Keep:

- standalone quote page as the primary estimate funnel
- journey-first lead model
- multilingual site support
- ChatKit as the chat runtime
- Astro content collections
- localized slug routing
- build-time i18n / OG / content guard scripts
- centralized page rendering as a concept
- the stable `src/lib/site-data` import surface for runtime and build tools

Replace:

- quote-specific branching inside generic page rendering
- reused contact-form implementation for quote intake
- scattered in-body quote CTA links as the primary funnel wiring
- legacy `chatkit-*` naming for backend resources that now serve the broader lead platform
- the current quote/contact retrofit path through shared components

## Why Rewrite This Slice Instead Of Iterating

The current implementation works, but it is structurally mixed:

- quote behavior is hard-coded into the generic renderer in `src/components/LocalizedPageContent.astro`
- quote-page copy is managed separately in `src/lib/site-data/quote-page-copy.js`
- the primary intake UI is still `src/components/QuoteRequestForm.jsx`
- backend resource names still center on `chatkit-*`, even though lead capture is now larger than chat

The current quote/contact/lead slice is the wrong long-term shape if the goal is clean development and lower operational drag. It increases:

- content drift
- naming drift
- special-case logic in shared components
- onboarding cost for every future developer
- risk when we add uploads, QUO, experiments, or new landing pages

However, the broader multilingual site framework is not accidental drift. The audit shows it was introduced deliberately to support:

- localized slug routing across all locales
- build-time translation and parity checks
- Open Graph generation based on localized page metadata
- centralized rendering so page shell logic is not duplicated in hundreds of MDX files
- a stable data import layer for Astro components, browser code, and Node build scripts

So the rewrite target is narrow and intentional:

- rewrite the quote/contact/lead architecture
- preserve the multilingual content and build framework unless and until a clearly better replacement exists

## Rewrite Goals

1. Make quote intake a first-class feature, not a retrofit.
2. Put all localized quote behavior behind one structured content model.
3. Preserve the existing localized Astro route/content/build system while cleaning the funnel architecture inside it.
4. Rename lead infrastructure around the real domain instead of around ChatKit history.
5. Make attachments/photos a first-class part of quote intake.
6. Separate public capture, async follow-up, and admin concerns cleanly.
7. Cut over hard, with no backward compatibility or data migration.

## Non-Goals

- Preserve old lead tables or IDs.
- Keep old GTM/GA4 event names for compatibility.
- Maintain legacy `lead_cases` behavior.
- Build a dual-write or bridge layer.

## Target Frontend Architecture

### 1. Feature-first structure

Create a dedicated feature area:

```text
src/features/quote/
  components/
    QuotePage.astro
    QuoteHero.astro
    QuoteChecklist.astro
    QuoteExpectations.astro
    QuoteLanguageSupport.astro
    QuoteRequestForm.tsx
    QuoteSuccessState.tsx
  content/
    schema.ts
  lib/
    form-schema.ts
    analytics.ts
    attachments.ts
    defaults.ts
  styles/
    quote-page.css
    quote-form.css
```

The quote page should render from this feature boundary. Generic content rendering should not know anything about quote-specific UI.

### 2. Preserve the route layer, improve the renderer boundary

Keep the current localized routes:

- `/en/request-a-quote/`
- `/es/solicitar-cotizacion/`
- etc.

Keep the existing route files:

- `src/pages/[lang]/index.astro`
- `src/pages/[lang]/[...slug].astro`

These are not the primary problem. They already provide a clean localized URL layer on top of the content collections.

The improvement should happen one layer below routing:

- keep route resolution
- keep `pageKey`-based translation identity
- add explicit `pageType`
- replace quote-specific branching inside the shared renderer with a renderer dispatcher

Do not branch inside shared page renderers with checks like `pageKey === "requestQuote"`.

Instead:

- the route loader should resolve a localized entry
- the entry schema should declare its page type
- the page type should map to a feature renderer

Example page types:

- `marketing`
- `service`
- `contact`
- `quote`
- `project`
- `reviews`

### 3. Quote form

Replace `QuoteRequestForm.jsx` with a dedicated quote form component.

Required fields:

- name
- preferred contact method
- at least one contact field
- preferred language
- vehicle year
- vehicle make
- vehicle model
- service category
- problem description

Optional fields:

- deadline / urgency
- photos
- notes

The form must own:

- validation
- submit states
- upload states
- analytics payloads
- field-level accessibility
- locale-specific expectations copy

### 4. CTA strategy

Do not rely on hand-authored quote CTA links scattered across MDX as the core funnel system.

Instead, service pages should declare CTA slots through structured content:

- `primaryCta`
- `secondaryCta`
- `inlineQuotePrompt`
- `quoteChecklistPlacement`

That makes quote prompts injectable and testable without editing every locale page body by hand.

## Target Content Architecture

### 1. Keep Astro content collections as the source of truth

Keep:

- `src/content.config.ts`
- `src/content/pages/*`
- the existing localized page-entry model

The repo already uses Astro content collections successfully. The rewrite should build on that, not replace it.

### 2. Use typed content collections

Extend the existing collections with better page typing and feature metadata rather than inventing a second route/content system.

Primary collection targets:

- `pages`
- `projects`
- `showcases`
- shared locale content JSON collections already under `src/content/`

Each localized page entry should include typed fields such as:

- `locale`
- `slug`
- `pageId`
- `pageType`
- `seo`
- `hero`
- `modules`
- `ctaConfig`

### 3. Keep the stable import surface

The current `src/lib/site-data/*.js` files are not purely accidental duplication. They provide a stable import surface for:

- Astro components
- browser-facing runtime code
- Node build scripts such as i18n validation and OG generation

So the rewrite should be selective:

- keep the stable import surface where it reduces call-site churn
- remove quote-only or funnel-specific registries that are better expressed as feature-local data
- only replace wrapper layers when there is a clear benefit and no build/runtime consumer penalty

Rule:

- content belongs in `src/content/`
- code belongs in `src/features/` or `src/lib/`
- wrapper modules should remain only when they provide a meaningful compatibility boundary

## Target Lead Platform Architecture

### 1. Domain naming

Keep the journey-first domain, but rename implementation surfaces around the real responsibilities.

Proposed backend modules:

```text
amplify/functions/_lead-platform/
  domain/
  repos/
  services/
  runtime.ts
```

Proposed public functions:

- `chat-session`
- `chat-handoff`
- `lead-interaction-capture`
- `quote-request-submit`
- `lead-followup`
- `lead-admin`
- `lead-asset-upload`
- `lead-action-link`

This is cleaner than carrying forward names such as:

- `chat-handoff-promote`
- `lead-interaction-capture`
- `lead-action-link-resolve`
- `quote-request-submit`

### 2. Table model

Use only the new model:

- `LeadJourneysTable`
- `LeadJourneyEventsTable`
- `LeadRecordsTable`
- `LeadContactsTable`
- `LeadAssetsTable`
- `LeadActionLinksTable`
- `QuoteRequestsTable`
- `ChatThreadDispatchTable`

Notes:

- `LeadAssetsTable` stores metadata for uploaded photos and future documents
- `ChatThreadDispatchTable` replaces the chat-email dedupe concern with a clearly named chat dispatch ledger

### 3. Request flow

Quote request flow:

1. browser validates fields
2. browser uploads photos through `lead-asset-upload`
3. browser submits typed quote payload to `quote-request-submit`
4. backend persists journey, journey event, lead record, contact, and quote request
5. backend enqueues async follow-up work
6. worker handles lead notification and customer follow-up
7. admin reads the same canonical lead/journey model

Chat flow:

1. browser gets chat session from `chat-session`
2. chat capture promotes qualified conversations through `chat-handoff`
3. transcript + summary + customer contact promotion become journey/lead updates
4. async follow-up uses the same worker and lead model as form submissions

### 4. Async execution model

Public capture functions should not do heavy orchestration inline.

Use:

- public capture Lambda for validation + persistence
- async worker Lambda for follow-up and delivery
- durable idempotency keyed by journey or chat thread

This gives better:

- retry behavior
- observability
- failure isolation
- operator trust

## Attachments / Photos

Photo upload should be part of a clean rewrite only if photos become durable
lead assets outside the ChatKit conversation lifecycle.

The old chat-specific S3 attachment function has been removed from the active
system. See `docs/chatkit/attachment-storage-decision.md` for the current
decision not to use Craig-owned S3 attachment storage.

If that decision changes, implement a shared lead asset pipeline:

- upload intent endpoint returns a scoped upload target
- browser uploads image(s)
- uploaded asset references are stored on the quote request
- lead notifications include the asset list
- admin surfaces asset previews/links

Minimum supported behavior:

- multiple image uploads
- MIME/type allowlist
- size limits
- upload expiration
- metadata capture
- storage key association with `journey_id`

## Analytics / Attribution

### 1. Centralize event contracts

Create one typed lead analytics module:

```text
src/features/lead-tracking/
  events.ts
  data-layer.ts
  payloads.ts
  attribution.ts
```

The quote form should not create analytics payloads ad hoc inside the component.

### 2. Quote-specific contract

Standard events:

- `lead_form_started`
- `lead_form_photo_upload_started`
- `lead_form_photo_upload_completed`
- `lead_form_submit_success`
- `lead_form_submit_error`

Shared attributes:

- `journey_id`
- `client_event_id`
- `occurred_at_ms`
- `page_type`
- `page_id`
- `locale`
- `preferred_contact_method`
- `preferred_language`

### 3. Keep lead truth clean

Do not reintroduce pre-message chat exposure events into lead measurement.

## Admin Experience

The admin surface should stop thinking in terms of legacy `lead_cases`.

Admin should read:

- lead record
- contact
- latest journey status
- event timeline
- uploaded assets
- follow-up status
- qualification status

Admin actions:

- qualify / disqualify
- add internal note
- mark customer contacted
- resend lead notification
- resend customer follow-up

## Files And Systems To Delete Or Replace

### Frontend / content

Delete or replace:

- `src/components/QuoteRequestForm.jsx`
- `src/components/QuoteRequestLanding.astro`
- `src/components/QuoteRequestCta.astro`
- quote branching in `src/components/LocalizedPageContent.astro`
- `src/lib/site-data/quote-page-copy.js`

Keep for now:

- `src/pages/[lang]/index.astro`
- `src/pages/[lang]/[...slug].astro`
- `src/lib/site-data/page-manifest.js`
- `src/lib/site-data/page-registry.js`
- `src/lib/site-data.js`
- build scripts under `scripts/` that enforce locale/content/OG parity

Only replace these later if we build a clearly better build-time metadata source with equivalent guard coverage.

### Backend

Delete or replace current lead-facing function surfaces:

- `amplify/functions/quote-request-submit/`
- `amplify/functions/lead-followup-worker/`
- `amplify/functions/lead-interaction-capture/`
- `amplify/functions/chat-handoff-promote/`
- `amplify/functions/lead-action-link-resolve/`
- `amplify/functions/lead-admin/`

Replace shared lead code root:

- `amplify/functions/_lead-platform/`
- target: `amplify/functions/_lead-platform/`

## Implementation Sequence

### Phase 1. New foundations inside the existing site framework

- create `src/features/quote/`
- create `src/features/lead-tracking/`
- extend the existing `pages` collection with `pageType` and `ctaConfig`
- add a page-rendering dispatcher behind the current route files
- define new backend module names and tables

### Phase 2. New quote funnel

- build the new standalone localized quote page
- build the new quote form
- add photo uploads
- wire the typed analytics contract

### Phase 3. New backend capture pipeline

- implement `quote-request-submit`
- implement `lead-asset-upload`
- implement `lead-followup`
- implement `lead-admin`

### Phase 4. Chat integration

- port chat promotion into the renamed lead platform
- keep ChatKit session logic separate but make handoff write into the same model

### Phase 5. Cutover the quote slice

- deploy new resources
- switch frontend to new endpoints
- verify form/chat/admin end to end
- remove legacy quote/contact retrofit resources from code and AWS

### Phase 6. Secondary architecture cleanup

- decide whether `page-manifest.js` should be replaced
- decide whether broader `site-data` wrapper cleanup is worth the churn
- decide whether broader chat/lead Lambda renaming should continue past the quote slice

## Cutover Rules

- no backward compatibility layer
- no data migration
- no legacy table preservation
- no dual-write period
- no reuse of legacy names inside the new quote/lead path just to minimize diff size

Do not interpret these rules as permission to rewrite the multilingual site framework unnecessarily. Hard cutover applies to the lead platform slice, not to routing and content infrastructure that is already serving real operational needs.

This should be treated as a replacement project for the lead funnel architecture, not a replacement project for the entire site framework.

## Why We Should Do This Now

Because the current moment is unusually favorable:

- no historical lead data needs to be preserved
- no other developers need compatibility
- QUO is not fully live yet
- the current code has already crossed from "small extension" into "structural retrofit"

If we keep iterating on the current quote/contact lead shape, we will keep paying for:

- special cases in shared rendering
- content drift across locales
- ambiguous ownership between contact and quote flows
- backend names that no longer match the domain

But the audit also shows we do not need to pay the cost of replacing the multilingual route/content/build framework to fix those problems. That framework is already carrying real value.

## Recommended Next Step

Start Phase 1 as a targeted rewrite, not as another patch set.

The first implementation slice should be:

1. extend the existing `pages` collection with `pageType` and `ctaConfig`
2. create the new feature folders and renderer dispatcher behind the current route layer
3. create the new backend module/function names in parallel
4. build the new quote page and quote form against those new boundaries
5. only then remove the current retrofit components

That sequence gives us a clean replacement path while keeping the final cutover controlled.
