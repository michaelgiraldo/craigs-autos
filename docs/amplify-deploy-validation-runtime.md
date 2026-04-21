# Amplify Deploy Validation vs Lambda Runtime

Last updated: 2026-04-19

This note documents a production deploy issue that looked like a Node runtime
problem but was actually an Amplify Gen2 deployment-time TypeScript validation
problem.

## Summary

Do not treat Lambda runtime support and Amplify deploy validation as the same
environment.

Craig's Lambda functions currently declare `runtime: 24` in their Amplify
function resources. Node 24 can run modern JavaScript features such as
`String.prototype.replaceAll`, `Object.hasOwn`, regex `u` flags, and standard
iterator spread. However, the failed deploy did not reach Lambda runtime.

The failure happened earlier:

```text
Git push
  -> Amplify Hosting build container
    -> npm run predeploy
    -> npx ampx pipeline-deploy
      -> Amplify backend synthesis
      -> Amplify backend TypeScript validation
        X failed here
      -> CloudFormation deploy
      -> Lambda Node 24 runtime
```

The important rule:

```text
Lambda runtime compatibility != Amplify synth-time TypeScript compatibility
```

If `ampx pipeline-deploy` rejects the backend source, Lambda Node 24 never runs
the code.

## What Failed

Amplify job `142` failed for commit `1e01a38` with:

```text
SyntaxError: TypeScript validation check failed.
Resolution: Fix the syntax and type errors in your backend definition.
```

The diagnostics included:

| Error | What It Proved |
|---|---|
| `Property 'replaceAll' does not exist on type 'string'` | The deploy validator's effective lib did not include ES2021 string APIs. |
| `Property 'hasOwn' does not exist on type 'ObjectConstructor'` | The deploy validator's effective lib did not include ES2022 object APIs. |
| `This regular expression flag is only available when targeting 'es6' or later` | The deploy validator behaved like the target was older than ES2015 for that check. |
| `Type 'MapIterator<...>' can only be iterated through when using '--downlevelIteration' or target es2015+` | The deploy validator rejected iterator spread over `Map.values()`. |

These are TypeScript validation errors, not Node 24 runtime errors.

## What Was Actually Happening

There are multiple relevant environments:

| Environment | Purpose | Notes |
|---|---|---|
| Local app typecheck | Local developer validation | `npx tsc` uses the repo's root TypeScript dependency. At the time of the failure this was TypeScript 6.0.3. |
| Amplify backend deploy validation | `ampx pipeline-deploy` backend source validation | The installed Amplify backend deployer uses its own TypeScript package. At the time of investigation, `@aws-amplify/backend-deployer@2.1.6` used TypeScript 5.9.3. |
| Amplify backend synthesis | Builds the CDK cloud assembly from `amplify/backend.ts` | This runs before CloudFormation deployment. |
| CloudFormation deployment | Applies AWS infrastructure changes | This only starts after synthesis and validation pass. |
| Lambda Node runtime | Executes deployed handlers | Craig's Amplify function resources declare Node runtime 24. |

The deploy failure happened in the second environment.

## Amplify Source Behavior

The installed Amplify CLI code confirms this behavior.

`npx ampx pipeline-deploy` calls the backend deployer with source validation
enabled. The backend deployer then calls a TypeScript compiler worker before
deploying the synthesized CDK assembly.

Relevant local package files:

- `node_modules/@aws-amplify/backend-cli/lib/commands/pipeline-deploy/pipeline_deploy_command.js`
- `node_modules/@aws-amplify/backend-cli/node_modules/@aws-amplify/backend-deployer/lib/cdk_deployer.js`
- `node_modules/@aws-amplify/backend-cli/node_modules/@aws-amplify/backend-deployer/lib/ts_compiler.js`

The compiler reads the backend-local `amplify/tsconfig.json`, sets `noEmit`,
`skipLibCheck`, `incremental`, and a build-info file, then reports diagnostics
as:

```text
TypeScript validation check failed.
```

This is also described by AWS Amplify documentation:

- https://docs.amplify.aws/react/build-a-backend/troubleshooting/cannot-find-module-amplify-env/

That page states that Amplify performs type-checking on sandbox and
`pipeline-deploy` using the backend-local `amplify/tsconfig.json`.

## Related Public GitHub Issues

The exact `replaceAll` / `Object.hasOwn` failure was not found as a documented
GitHub issue, but the broader class of issues is documented:

| Issue | Relevance |
|---|---|
| https://github.com/aws-amplify/amplify-backend/issues/1374 | `pipeline-deploy` TypeScript validation differed between local/sandbox and CI deploy behavior. |
| https://github.com/aws-amplify/amplify-backend/issues/1854 | Amplify-generated/env validation produced misleading TypeScript errors; comments confirm multiple tsconfig layers matter. |
| https://github.com/aws-amplify/amplify-backend/issues/2810 | `pipeline-deploy` failed TypeScript validation for a file under `amplify/seed`, showing that Amplify may validate more backend-adjacent source than expected. |

The practical lesson is that Amplify Gen2's code-first DX has a real
deployment-time TypeScript gate. Passing local app typecheck is not enough.

## Why Test Files Mattered

Some failures came from `*.test.ts` files under `amplify/functions`.

That means Amplify's backend validation scans broadly under the backend
project directory. It does not only validate Lambda handler entrypoints.

This is a DX risk:

```text
amplify/functions/**/*.test.ts
  -> useful for local backend tests
  -> also visible to Amplify backend validation
  -> can break deploy even though tests are not deployed as Lambda handlers
```

The current repo keeps backend tests beside the code, but makes the boundary
explicit:

| Config | Purpose |
|---|---|
| `amplify/tsconfig.json` | Deploy-time backend validation used by `ampx pipeline-deploy`; excludes `*.test.ts` and `*.spec.ts`. |
| `amplify/tsconfig.test.json` | Local backend test typecheck; includes all backend `*.ts` files, including tests. |

`npm run typecheck:backend` runs both configs. The
`npm run verify:amplify-deploy-compiler` script invokes the installed Amplify
backend deployer compiler locally, using the same internal compiler entrypoint
that `pipeline-deploy` reaches after synthesis.

## Fix That Cleared The Deploy

Commit `8929947` fixed the deploy by doing two things:

1. Made `amplify/tsconfig.json` explicit about modern target/lib:

```json
{
  "compilerOptions": {
    "target": "es2025",
    "lib": ["ES2025"]
  }
}
```

2. Replaced syntax that Amplify had already rejected with older equivalent
syntax:

| Rejected Form | Safer Form |
|---|---|
| `value.replaceAll(".", "")` | `value.split(".").join("")` |
| `Object.hasOwn(object, key)` | `Object.keys(object).indexOf(key) >= 0` |
| `[...map.values()]` | `map.forEach((value) => values.push(value))` |
| regex `/.../u` where not needed | regex without `u` |

The second step is conservative. Node 24 can run the original syntax, but the
production deploy path must pass Amplify validation first.

After the patch:

```text
Amplify job: 143
Commit: 8929947
Message: Fix Amplify managed conversion type validation
Status: SUCCEED
Start: 2026-04-19 16:57:30 PDT
End:   2026-04-19 17:08:45 PDT
```

## How To Reproduce Amplify's Backend Typecheck Locally

Run the normal backend typecheck first. This checks deployable backend source and
backend test source under separate configs:

```bash
npm run typecheck:backend
```

Then run Amplify's installed backend deployer compiler directly:

```bash
npm run verify:amplify-deploy-compiler
```

That script wraps the internal compiler entrypoint below:

```bash
node --input-type=module - <<'NODE'
import { compileProject } from './node_modules/@aws-amplify/backend-cli/node_modules/@aws-amplify/backend-deployer/lib/ts_compiler.js';

try {
  compileProject(new URL('./amplify/', import.meta.url).pathname);
  console.log('Amplify backend-deployer compileProject passed');
} catch (error) {
  console.error(error?.name ?? error);
  console.error(error?.message ?? '');
  console.error(error?.details ?? '');
  process.exit(1);
}
NODE
```

This is not a public API. Use it as a debugging tool only. It is still useful
because it invokes the same installed Amplify compiler code path that
`pipeline-deploy` uses for backend validation.

## How To Check The AWS Amplify Job

Use the Craig's AWS profile:

```bash
aws amplify list-jobs \
  --app-id d3du4u03f75wsu \
  --branch-name main \
  --max-items 5 \
  --profile AdministratorAccess-281934899223 \
  --output json
```

If a job fails, inspect whether the failure happened before or after the
CloudFormation deployment phase.

If the error says:

```text
TypeScript validation check failed.
```

then debug `amplify/tsconfig.json`, backend source inclusion, and the Amplify
backend deployer compiler before debugging Lambda runtime.

## Future Guidance

Prefer production-deploy-stable backend syntax over syntax that only passes the
local runtime and local TypeScript compiler.

Before adding new backend language features under `amplify/`, ask:

| Question | Why It Matters |
|---|---|
| Does Lambda Node 24 support this? | Runtime compatibility. |
| Does `npm run typecheck:backend` accept this? | Repo-local deploy and backend test type safety. |
| Does Amplify's backend deployer compiler accept this? | Actual deploy gate. |
| Is this syntax inside `amplify/functions/**/*.test.ts`? | Tests are locally typechecked, but deploy validation should keep excluding them. |
| Is this code deploy-time infrastructure code or Lambda runtime code? | The same source tree contains both concerns. |

For production-grade DX, the long-term clean alternative is still a pure CDK
backend deployment path. Amplify Gen2 wraps CDK and adds this validation layer.
CDK would make the synthesis, bundling, source inclusion, and TypeScript
versioning more explicit. That is a separate migration decision; it is not
required to keep the current Amplify deployment working.
