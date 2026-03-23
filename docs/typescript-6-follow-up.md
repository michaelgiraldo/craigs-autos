# TypeScript 6 Follow-Up

As of March 23, 2026, this repo was moved to TypeScript `6.0.2`.

To make that upgrade installable, we removed `@astrojs/check` from the root
`devDependencies`. At the time of removal, `@astrojs/check` declared the peer
dependency below and would not install cleanly with TypeScript 6:

```json
{
  "typescript": "^5.0.0"
}
```

## Removed package

- `@astrojs/check`

## Why it was removed

- It was the direct package preventing a clean upgrade from TypeScript `5.9.3`
  to `6.0.2`.
- It was not referenced by any repo script, so removing it did not break the
  existing validation pipeline.

## What to check later

Re-check `@astrojs/check` when Astro publishes a release that supports
TypeScript 6.

Suggested re-check commands:

```sh
npm info @astrojs/check peerDependencies --json
npm install -D @astrojs/check
npm run predeploy
npm run build
```

If `@astrojs/check` adds TypeScript 6 support and installs cleanly, it can be
added back as optional Astro-specific diagnostics tooling.
