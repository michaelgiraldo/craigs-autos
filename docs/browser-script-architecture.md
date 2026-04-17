# Browser Script Architecture

This repo now has one hard rule for local browser scripts:

- Do not load `src/*.ts` files with `?url` and feed that URL into `<script type="module" src={...}>`.
- Do load local browser code through Astro's processed `<script>` pipeline so Astro/Vite emits real JavaScript assets.

## Why this changed

The older pattern in `AnalyticsHead.astro` and `src/pages/admin/leads.astro` imported
TypeScript files with `?url`, which preserved the `.ts` extension in the emitted asset
path. In production, the browser requested URLs like:

- `/_astro/lead-signals.<hash>.ts`

That is fragile because the CDN/server can infer the wrong MIME type from `.ts`
(for example `video/vnd.dlna.mpeg-tts`) and browsers will reject it for
`type="module"` scripts.

## Current pattern

Use a processed Astro script that imports the local module:

```astro
<script>
  import { initLeadSignals } from '../../scripts/analytics/index.ts';

  initLeadSignals();
</script>
```

Astro processes that script, bundles dependencies, and serves JavaScript with the
correct MIME type.

## Current entry points

- `src/layouts/base/AnalyticsHead.astro`
  - Loads the analytics/browser lead-signal entrypoint.
- `src/layouts/base/BaseLayoutScripts.astro`
  - Loads shared layout behaviors.
- `src/pages/admin/leads.astro`
  - Loads the admin leads page script.

## Analytics structure

The old monolithic `src/scripts/lead-signals.ts` has been replaced with smaller modules:

- `src/scripts/analytics/shared.ts`
- `src/scripts/analytics/attribution.ts`
- `src/scripts/analytics/transport.ts`
- `src/scripts/analytics/events.ts`
- `src/scripts/analytics/index.ts`

That split makes the responsibilities explicit:

- attribution parsing
- dataLayer/backend transport
- event tracking
- page bootstrap

## Admin leads structure

The admin leads page keeps a small imperative DOM renderer, but the previous
monolithic `src/scripts/admin-leads.ts` entrypoint has been split into focused
modules under `src/scripts/admin-leads/`:

- API endpoint resolution and admin requests
- session auth storage
- DOM-safe rendering helpers
- lead/journey formatters
- shared state and payload types

Customer-derived lead values should be written with `textContent`/DOM nodes, not
interpolated through `innerHTML`.
