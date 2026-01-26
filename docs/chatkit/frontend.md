# ChatKit lead intake - frontend

This document describes the website-side integration: how ChatKit is embedded
into the Astro site, how sessions are created, how thread ids are tracked, and
how the frontend triggers lead emails without customer effort.

Related docs:

- Overview: `docs/chatkit/overview.md`
- Backend: `docs/chatkit/backend.md`
- Agent Builder: `docs/chatkit/agent-builder.md`

## Key files

- `src/components/ChatWidget.astro`
  - Astro wrapper that mounts the React chat widget.

- `src/components/ChatWidgetReact.jsx`
  - The ChatKit UI implementation (React).
  - Loads the ChatKit runtime JS.
  - Creates ChatKit sessions via `api.getClientSecret(...)`.
  - Persists `threadId` and triggers lead-email sends.

- `src/lib/site-data.js`
  - Per-locale UI copy for the chat widget (`CHAT_COPY`).

## What renders the chat UI

This repo does NOT build a custom chat UI.

Instead:

- ChatKit renders the full chat interface (messages, composer/input, header, etc).
- We wrap it in a "launcher + panel" experience so it works well on desktop and mobile.

This is intentionally production-friendly:

- Less custom UI code to maintain.
- The chat always looks like a real chat (composer, message bubbles, etc).

## ChatKit runtime loading

`@openai/chatkit-react` is a React wrapper around a web component (`<openai-chatkit>`).
The runtime JS that defines the web component is loaded separately.

In this repo, `src/components/ChatWidgetReact.jsx` loads:

- `https://cdn.platform.openai.com/deployments/chatkit/chatkit.js`

Override for future changes / testing:

- `PUBLIC_CHATKIT_RUNTIME_URL` (single URL)
- `PUBLIC_CHATKIT_RUNTIME_URLS` (comma-separated list, tried in order)

The code attempts to load each URL and waits for:

- `customElements.whenDefined('openai-chatkit')`

If the runtime fails to load, the UI shows the localized fallback error message
from `CHAT_COPY[locale].errorBody`.

## Locale mapping and RTL

The site has many locales. The frontend passes a ChatKit locale, and sets `dir`
to support RTL when needed.

Implementation details:

- `CHATKIT_LOCALE_MAP` in `src/components/ChatWidgetReact.jsx` maps the site's
  locale ids (ex: `zh-hans`) to ChatKit locale ids (ex: `zh-CN`).
- For Arabic, `dir` is set to `rtl`.

If the site adds a new locale:

1) Add it to `src/lib/site-data.js` (LOCALES + CHAT_COPY).
2) Add it to `CHATKIT_LOCALE_MAP` so ChatKit uses the correct UI localization.

## Session creation (getClientSecret)

ChatKit requests an ephemeral `client_secret` by calling:

```js
api.getClientSecret(current) => Promise<string>
```

In this repo, `getClientSecret` performs:

1) Determine the session endpoint URL.
2) POST JSON with:
   - `current` (ChatKit internal)
   - `locale`
   - `pageUrl` (current `window.location.href`)
   - `user` (a stable `anon_...` id from localStorage)
3) Expect JSON `{ client_secret: "..." }`

### Endpoint discovery (amplify_outputs.json)

We do not hardcode per-branch backend URLs.

Production builds generate `public/amplify_outputs.json` which includes:

- `custom.chatkit_session_url`
- `custom.chatkit_lead_email_url`

The frontend fetches `/amplify_outputs.json` and uses those URLs.

Why this matters:

- Every Amplify branch environment can have different Function URL endpoints.
- The frontend stays static and self-configuring.

Fallback behavior:

- In dev, the widget can call a local endpoint served by `server/chatkit-dev.mjs`.
- In production, if outputs cannot be fetched, the widget falls back to configured URLs.

## Thread id and user id persistence

The frontend tracks two ids:

- `userId`:
  - key: `chatkit-user-id` (localStorage)
  - value: `anon_<uuid>`
  - purpose: stable "visitor id" for ChatKit sessions

- `threadId`:
  - key: `chatkit-thread-id` (sessionStorage)
  - value: `cthr_...`
  - purpose: restore the current conversation after a refresh in the same tab/session

Thread id is updated via ChatKit callbacks:

- `onThreadChange({ threadId })`

Notes:

- Thread ids are canonical conversation ids (see `docs/chatkit/overview.md`).
- SessionStorage is intentionally scoped to a browser tab session to avoid
  surprising cross-tab thread sharing.

## Lead email triggers (no customer action)

The lead-email endpoint is called from the frontend with:

- `threadId` (cthr_...)
- `locale`
- `pageUrl`
- `user`
- `reason`

The goal is to send the transcript automatically once the chat becomes actionable.

Triggers implemented in `src/components/ChatWidgetReact.jsx`:

1) `reason: "auto"` (primary)
   - Sent after each assistant response (`onResponseEnd`).
   - Backend only sends when the chat is "handoff_ready" (prevents early emails).

2) `reason: "idle"`
   - After 90 seconds of idle time while the chat is open.
   - Helps catch "abandoned chat" where the user gave contact info and left.

3) `reason: "pagehide"`
   - On tab hide/unload.
   - Uses `fetch(..., { keepalive: true })` to try to send during navigation.

4) `reason: "chat_closed"`
   - When the user closes the chat panel.
   - Still not required (the other triggers are the primary path).

### Client-side dedupe

The frontend also does a lightweight dedupe to reduce backend calls:

- localStorage key: `chatkit-lead-sent:<threadId>` = `true`

If that key is present, the frontend stops calling the lead-email endpoint.

Important:

- Server-side DynamoDB is the real idempotency enforcement (cross-device safe).
- Client-side dedupe is just an optimization.

## UI copy and prompts (CHAT_COPY)

`src/lib/site-data.js` contains `CHAT_COPY` entries per locale, including:

- launcher label
- start greeting
- composer placeholder
- start prompt buttons (icon/label/prompt)
- error messaging

ChatKit enforces a schema for `startScreen.prompts[*].icon`.
If you use an invalid icon id, ChatKit throws a validation error and the UI fails.

When editing prompts:

- Prefer copying an existing icon id that you know works.
- Test locally and watch DevTools console for `ChatKit.create(): Invalid input`.

## Mobile behavior

The widget uses a launcher button and a panel.

On mobile (max-width: 900px), the panel locks body scroll while open to avoid
scroll jank with an overlay chat.

If you change layout/styling:

- Test mobile Safari + Chrome.
- Ensure the composer input stays visible above the keyboard.

## How to safely change X (frontend)

### Change UI copy across locales

1) Edit `CHAT_COPY` in `src/lib/site-data.js`.
2) Keep the same keys across locales (missing keys fall back to English).
3) Run `npm run build` to ensure MDX + i18n checks pass.
4) Smoke test at least:
   - `en`, `es`, `zh-hans`, `ar` (RTL)

### Change the start prompt buttons

1) Edit `CHAT_COPY[locale].startPrompts`.
2) Reuse known-good `icon` ids; invalid icons break the widget.
3) Verify the ChatKit UI loads (you see a composer input).

### Change triggers (idle/pagehide/auto)

1) Update the timing constant in `src/components/ChatWidgetReact.jsx`:
   - `IDLE_LEAD_SEND_MS`
2) Keep `reason` strings stable unless you also update backend logic/metrics.
3) Verify you still get at most one email per thread (server idempotency).

### Change theme colors

Theme lives in the `options.theme` object in `src/components/ChatWidgetReact.jsx`.
After a change:

- Verify contrast (text readable on background).
- Verify focus rings and buttons remain visible.

## Common frontend failure modes

### Chat panel renders but no input box

Common causes:

- ChatKit runtime JS did not load (blocked or wrong URL).
- ChatKit initialized while the panel was hidden (layout measurement issue).
- A validation error in options (often invalid `startScreen.prompts[*].icon`).

Debug steps:

1) Open DevTools console.
2) Look for:
   - "Failed to load ... chatkit.js"
   - "ChatKit.create(): Invalid input"
3) Confirm the runtime URL loads in the Network tab.

### "Please try again or call/text us." appears

This is the widget fallback when ChatKit session creation fails or runtime init fails.

Check:

- `/amplify_outputs.json` loads and has valid `custom.chatkit_session_url`.
- Domain allowlist includes the current domain.
- CORS allows the current origin.

For backend debugging steps, see `docs/chatkit/runbook.md`.

