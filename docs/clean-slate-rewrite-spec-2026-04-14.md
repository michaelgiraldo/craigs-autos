# Clean-Slate Rewrite Spec

- Date: 2026-04-14
- Status: approved direction
- Scope: Craig's website repo only
- Priority: optimize for developer experience and production quality, not incremental shipping

## Decision

We should replace the current quote/contact lead implementation with a clean-slate architecture.

Keep:

- standalone quote page as the primary estimate funnel
- journey-first lead model
- multilingual site support
- ChatKit as the chat runtime

Replace:

- quote-specific branching inside generic page rendering
- reused contact-form implementation for quote intake
- scattered in-body quote CTA links as the primary funnel wiring
- custom page-manifest filesystem scanning
- legacy `chatkit-*` naming for backend resources that now serve the broader lead platform

## Why Rewrite Instead Of Iterating

The current implementation works, but it is structurally mixed:

- quote behavior is hard-coded into the generic renderer in `src/components/LocalizedPageContent.astro`
- quote-page copy is managed separately in `src/lib/site-data/quote-page-copy.js`
- the primary intake UI is still `src/components/ContactLeadForm.jsx`
- page translation/path lookup is partly driven by a custom filesystem manifest in `src/lib/site-data/page-manifest.js`
- content is split across MDX, JSON, and JS wrappers under `src/content/` and `src/lib/site-data/`
- backend resource names still center on `chatkit-*`, even though lead capture is now larger than chat

That is the wrong long-term shape if the goal is clean development and lower operational drag. It increases:

- content drift
- naming drift
- special-case logic in shared components
- onboarding cost for every future developer
- risk when we add uploads, QUO, experiments, or new landing pages

## Rewrite Goals

1. Make quote intake a first-class feature, not a retrofit.
2. Put all localized quote behavior behind one structured content model.
3. Remove custom filesystem manifest plumbing where Astro content collections already solve the problem.
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

### 2. Route model

Keep localized routes, but make the quote route a first-class route type:

- `/en/request-a-quote/`
- `/es/solicitar-cotizacion/`
- etc.

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

Replace `ContactLeadForm.jsx` with a dedicated quote form component.

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

### 1. Remove the custom page-manifest layer

Retire:

- `src/lib/site-data/page-manifest.js`

The current implementation already uses `astro:content` in routes. Translation/path data should be derived from content collections, not from a separate filesystem parser that re-reads frontmatter from disk.

### 2. Use typed content collections

Adopt explicit content schemas for:

- `pages`
- `quote-pages`
- `projects`
- `showcases`
- `shared-ui`

Each localized page entry should include typed fields such as:

- `locale`
- `slug`
- `pageId`
- `pageType`
- `seo`
- `hero`
- `modules`
- `ctaConfig`

### 3. Single source of truth for locale copy

Today the repo duplicates content across:

- `src/content/*.json`
- `src/lib/site-data/*.js`
- MDX files

The rewrite should collapse that into:

- content collections for authorable localized copy
- TypeScript constants only for true code constants

Rule:

- content belongs in `src/content/`
- code belongs in `src/features/` or `src/lib/`
- JS wrapper mirrors around JSON files should be removed unless they add real logic

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

- `chatkit-lead-email`
- `chatkit-lead-signal`
- `chatkit-message-link`
- `contact-submit`

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
6. worker handles owner notification and customer follow-up
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

Photo upload should be part of the initial clean rewrite, not a later add-on.

There is already a chat-specific attachment function in:

- `amplify/functions/chatkit-attachment-upload/handler.ts`

Rewrite that into a shared lead asset pipeline:

- upload intent endpoint returns a scoped upload target
- browser uploads image(s)
- uploaded asset references are stored on the quote request
- owner notifications include the asset list
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
- resend owner notification
- resend customer follow-up

## Files And Systems To Delete Or Replace

### Frontend / content

Delete or replace:

- `src/components/ContactLeadForm.jsx`
- `src/components/QuoteRequestLanding.astro`
- `src/components/QuoteRequestCta.astro`
- quote branching in `src/components/LocalizedPageContent.astro`
- `src/lib/site-data/quote-page-copy.js`
- `src/lib/site-data/page-manifest.js`

Reduce or remove duplicate wrapper layers under:

- `src/lib/site-data/`

### Backend

Delete or replace current lead-facing function surfaces:

- `amplify/functions/contact-submit/`
- `amplify/functions/quote-followup/`
- `amplify/functions/chatkit-lead-signal/`
- `amplify/functions/chatkit-lead-email/`
- `amplify/functions/chatkit-message-link/`
- `amplify/functions/chatkit-attachment-upload/`
- `amplify/functions/chatkit-lead-admin/`

Replace shared lead code root:

- `amplify/functions/_lead-core/`
- target: `amplify/functions/_lead-platform/`

## Implementation Sequence

### Phase 1. New foundations

- create `src/features/quote/`
- create `src/features/lead-tracking/`
- define content schemas for page types and quote pages
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

### Phase 5. Cutover

- deploy new resources
- switch frontend to new endpoints
- verify form/chat/admin end to end
- remove legacy resources from code and AWS

## Cutover Rules

- no backward compatibility layer
- no data migration
- no legacy table preservation
- no dual-write period
- no reuse of legacy names just to minimize diff size

This should be treated as a replacement project, not a migration project.

## Why We Should Do This Now

Because the current moment is unusually favorable:

- no historical lead data needs to be preserved
- no other developers need compatibility
- QUO is not fully live yet
- the current code has already crossed from "small extension" into "structural retrofit"

If we keep iterating on the current shape, we will keep paying for:

- special cases in shared rendering
- content drift across locales
- ambiguous ownership between contact and quote flows
- backend names that no longer match the domain

## Recommended Next Step

Start Phase 1 as a real rewrite, not as another patch set.

The first implementation slice should be:

1. create the new feature folders and schemas
2. create the new backend module/function names in parallel
3. build the new quote page and quote form against those new boundaries
4. only then remove the current retrofit components

That sequence gives us a clean replacement path while keeping the final cutover controlled.
