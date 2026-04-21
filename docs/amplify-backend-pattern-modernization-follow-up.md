# Amplify Backend Pattern Modernization Follow-up

Last updated: 2026-04-21

This note tracks backend syntax patterns that were made conservative because
Amplify Gen2 deploy-time TypeScript validation does not behave exactly like the
local Lambda runtime or the repo's root TypeScript compiler.

The goal is not to keep old-fashioned code forever. The goal is to modernize
only when the actual deploy gate proves the pattern is supported.

## Current Boundary

| Source Area | Rule |
|---|---|
| `amplify/functions/**/*.test.ts` | May use modern TypeScript/JavaScript patterns if `npm run typecheck:backend:tests` and `npm run test:backend` pass. Tests are excluded from Amplify deploy validation. |
| Deployable backend source under `amplify/` | Must pass `npm run verify:amplify-deploy-compiler`, not only local `tsc`. |
| Frontend, scripts, and site code outside `amplify/` | Not part of Amplify backend deploy validation; use the normal repo typecheck/lint/build gates. |

## Current Pattern Status

| Pattern | Deploy Source Status | Test Source Status | Current Guidance |
|---|---|---|---|
| `[...map.values()]` / iterator spread | Blocked by Amplify deploy compiler in deployable backend source. | Allowed. | Use `Array.from(map.values())` in deploy source until support is proven. |
| `Array.from(map.values())` | Supported. | Allowed. | Preferred deploy-source modernization for map/set values. |
| `Array.from(new Set(values))` | Supported. | Allowed. | Allowed in deploy source; this is cleaner than manual uniqueness loops. |
| `array.at(-1)` | Not proven for deploy source under Amplify's bundled compiler. | Allowed. | Use freely in tests; probe before using in deploy source. |
| `String.prototype.replaceAll` | Blocked by Amplify deploy compiler in deployable backend source. | Allowed if test typecheck passes. | Keep `split(...).join(...)` in deploy source until support is proven. |
| regex `u` flag | Blocked by Amplify deploy compiler in deployable backend source with current effective target behavior. | Allowed outside deploy source. | Keep plain ASCII regexes without `u` in deploy source unless Unicode semantics are required and support is proven. |
| `Object.hasOwn` | Blocked by Amplify deploy compiler in deployable backend source. | Allowed if test typecheck passes. | Prefer `Object.keys(record).includes(key)` in deploy source for now. |
| `Object.keys(record).includes(key)` | Supported. | Allowed. | Current deploy-safe replacement for ownership checks. |

## Known Conservative Deploy-Source Locations

| File | Conservative Pattern | Preferred Future Form |
|---|---|---|
| `amplify/functions/_lead-platform/services/conversion-feedback/identity-normalization.ts` | `split('.').join('')` | `replaceAll('.', '')` after deploy compiler support is proven. |
| `amplify/functions/_lead-platform/services/conversion-feedback/providers/google-ads/config.ts` | `split('-').join('')` | `replaceAll('-', '')` after deploy compiler support is proven. |
| `amplify/functions/_lead-platform/services/conversion-feedback/identity-normalization.ts` | regexes without `u` | Add `u` only after deploy compiler support is proven and Unicode semantics matter. |
| `amplify/functions/_lead-platform/services/conversion-feedback/config.ts` | ASCII validation regex without `u` | Add `u` only after deploy compiler support is proven and Unicode semantics matter. |
| `amplify/functions/_lead-platform/services/conversion-feedback/providers/yelp/config.ts` | ASCII validation regex without `u` | Add `u` only after deploy compiler support is proven and Unicode semantics matter. |

## How To Prove A Pattern Is Supported

Before replacing conservative deploy-source code with a modern pattern:

1. Add or temporarily test the pattern in a deployable file under `amplify/`,
   not only in a `*.test.ts` file.
2. Run:

```bash
npm run verify:amplify-deploy-compiler
npm run typecheck:backend
npm run predeploy
```

3. If the pattern passes, update this document's pattern table and modernize the
   relevant deploy-source files.
4. If the pattern fails, keep the conservative form and record the failure if it
   teaches something new.

## Follow-up Work

The next hardening step is to make
`scripts/verify-amplify-deploy-compiler.mjs` fail on TypeScript config parse
errors from Amplify's bundled TypeScript before it calls Amplify's internal
`compileProject` helper.

Why this matters: the installed Amplify compiler currently validates backend
source, but its internal helper does not surface all config parse errors. A
repo-owned preflight would make unsupported `target`, `lib`, or `module` values
fail locally before a deploy reaches Amplify Hosting.

Definition of done for that follow-up:

- Parse `amplify/tsconfig.json` with the same TypeScript package resolved from
  Amplify's backend deployer.
- Fail if `parseJsonConfigFileContent` returns diagnostics.
- Keep calling Amplify's internal `compileProject` after config parsing passes.
- Add a small architecture guard or script test so the preflight cannot be
  removed silently.
- Run `npm run predeploy`.
