# TypeScript 6 Audit

Audit date: March 23, 2026

## What I checked

- Ran `npx tsc --pretty false --noEmit -p tsconfig.json`
- Ran `npx tsc --pretty false --noEmit -p amplify/tsconfig.json`
- Scanned the repo for TypeScript 6 deprecated config values and syntax
- Verified current TypeScript 6 deprecations against the official TypeScript 6.0 announcement

## Repo changes made

- Upgraded to TypeScript `6.0.2`
- Removed `@astrojs/check` because it still peers on TypeScript `^5.0.0`
- Added direct `@types/node` to `devDependencies`
- Split TypeScript config by runtime boundary:
  - `tsconfig.json` for Astro/browser-facing code
  - `tsconfig.node.json` for Node scripts and local tooling
  - `amplify/tsconfig.json` for Amplify/backend code
- Kept ambient package types explicit:
  - `tsconfig.json` uses `"types": []`
  - `tsconfig.node.json` uses `"types": ["node"]`
  - `amplify/tsconfig.json` uses `"types": ["node"]`

## Why these changes matter

TypeScript 6 changes the default `types` behavior toward an explicit model.
This repo contains browser code, Node scripts, and backend Lambda code with
different runtime assumptions. Splitting the configs prevents Node globals from
bleeding into browser-facing files while keeping Node-based code explicit about
its ambient types. A direct `@types/node` dependency plus explicit `types`
entries keeps the repo stable as TypeScript continues toward 7.0.

## Deprecated features checked in this repo

Not used in this repo:

- `target: "es5"`
- `downlevelIteration`
- `moduleResolution: "node"` / `"node10"`
- `moduleResolution: "classic"`
- `module: "amd"`, `"umd"`, `"systemjs"`, or `"none"`
- `baseUrl`
- `outFile`
- legacy `module Foo {}` namespace syntax
- import assertions using `asserts`
- `/// <reference no-default-lib="true"/>`
- command-line file compilation in the form `tsc some-file.ts` next to a `tsconfig.json`

Still relevant conceptually, but already compatible here:

- strict mode assumptions (`alwaysStrict`)
- DOM iterable lib merge
- newer module/target defaults
- `rootDir` default changes

## Current conclusion

After the TypeScript 6 migration, this repo compiles and builds cleanly without
using any deprecated TypeScript 6 configuration or syntax that requires further
code rewrites.
