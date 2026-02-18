# Breaking Change Audit (2026-02-18)

This document records the current high-impact findings from a source-code audit and explains the "why" in plain language.

Use this as a decision log and learning guide before choosing which breaking changes to implement.

## Scope

- Type: source-code and configuration audit of this repository
- Date: 2026-02-18
- Included: frontend Astro routes/layouts, Amplify backend infra, Lambda handlers, dependency scan
- Not included: live environment penetration testing, cloud account policy review outside repo code

## Executive Summary

These are the major changes worth considering:

1. Move internet-facing Lambda Function URLs from public access to authenticated access.
2. Replace shared-password admin auth with user-based auth.
3. Lock down server-side attachment URL fetching to prevent SSRF-style abuse.
4. Make SMS token links one-time-use instead of reusable until TTL.
5. Tighten wildcard IAM permissions.
6. Replace DynamoDB Scan-based admin listing with Query/index design.
7. Remediate production dependency vulnerabilities.

## Findings And Recommended Breaking Changes

### 1) Public unauthenticated Function URLs

What we found:

- `authType: FunctionUrlAuthType.NONE` is used for multiple endpoints in `amplify/backend.ts`:
  - session URL at line 28
  - lead email URL at line 50
  - sms link URL at line 71
  - lead signal URL at line 92
  - lead admin URL at line 112

Why this matters (plain language):

- Anyone on the internet can call these endpoints directly.
- CORS does not stop server-to-server abuse; it only guides browser behavior.
- This can lead to abuse, higher cost, and unnecessary attack surface.

Breaking change recommendation:

- Move these endpoints behind authenticated API entry points (for example: API Gateway + auth, or another authenticated edge).
- Enforce rate limiting/WAF at the edge.

What implementation usually involves:

- New auth model (JWT/Cognito/IAM/custom signature)
- Client updates to send auth
- Backend validation and rejection paths
- Rollout plan for existing clients

What improves:

- Better protection against abuse and spam traffic
- Better observability and access control
- Lower risk of accidental public exposure

### 2) Admin endpoint uses Basic auth with shared password

What we found:

- Admin password check in `amplify/functions/chatkit-lead-admin/handler.ts:61-76`
- Admin endpoint is also on a public Function URL in `amplify/backend.ts:112`
- Browser stores Basic token in session storage in `public/admin-leads.js:9` and `public/admin-leads.js:120`

Why this matters (plain language):

- Shared password means no per-user identity, no role separation, and weak audit trails.
- Basic auth tokens can be replayed if exposed.

Breaking change recommendation:

- Replace shared Basic auth with real user authentication and authorization.
- Add role-based access and identity-level logging.

What implementation usually involves:

- Identity provider setup (for example Cognito/SSO)
- Route protection and token validation
- Admin UI login flow migration

What improves:

- Better admin security
- Easier revocation and rotation
- Better compliance posture and accountability

### 3) Attachment URL fetching can be abused (SSRF-style risk)

What we found:

- URL checker accepts any `http/https` URL in `amplify/functions/chatkit-lead-email/handler.ts:571-576`
- Server fetches that URL in `amplify/functions/chatkit-lead-email/handler.ts:656-663`
- Attachment lines are parsed from transcript text in `amplify/functions/chatkit-lead-email/handler.ts:952-986`
- Attachment lines are also constructed in transcript content in `amplify/functions/chatkit-lead-email/handler.ts:1172-1183`

Why this matters (plain language):

- If an attacker can influence attachment-like URL text, the server may fetch unintended URLs.
- That can expose internal services or create abusive outbound traffic.

Breaking change recommendation:

- Restrict allowed attachment source URLs to trusted domains/buckets only.
- Prefer signed object identifiers over free-form URLs.

What implementation usually involves:

- Allowlist enforcement
- Signature validation for attachment IDs
- Reject unknown hosts/protocol edge cases

What improves:

- Reduces server-side request forgery risk
- Tighter control over attachment ingestion

### 4) SMS link tokens are not consumed on first use

What we found:

- SMS token handler reads token and returns payload but does not delete/consume it in `amplify/functions/chatkit-sms-link/handler.ts:71-90`

Why this matters (plain language):

- If someone gets a token URL, they can reuse it until it expires.

Breaking change recommendation:

- Convert to one-time token consumption (read + conditional delete/update).

What implementation usually involves:

- Conditional writes in DynamoDB to prevent race reuse
- Clear error behavior for already-consumed tokens

What improves:

- Stronger privacy and replay protection for SMS workarounds

### 5) IAM permissions are too broad in critical policies

What we found:

- Wildcard resources in `amplify/backend.ts`:
  - SES policy at line 128
  - scheduler invoke policy at line 143
  - scheduler management policy at line 155

Why this matters (plain language):

- If a function is compromised, broad permissions increase blast radius.

Breaking change recommendation:

- Scope IAM resource permissions to exact resources/arns and actions needed.

What implementation usually involves:

- Policy redesign and deployment test
- Validation that schedule and SES workflows still work

What improves:

- Better least-privilege security
- Reduced impact from compromised credentials or code paths

### 6) Admin lead listing uses DynamoDB Scan + in-memory sort

What we found:

- Scan operation and local sort in `amplify/functions/chatkit-lead-admin/handler.ts:149-153`

Why this matters (plain language):

- Scan reads large portions of a table and gets slower/more expensive as data grows.
- Pagination and ordering can become inconsistent.

Breaking change recommendation:

- Introduce a queryable access pattern (GSI + Query) for the admin listing use case.

What implementation usually involves:

- Table/index schema update
- Data access rewrite
- Cursor logic update

What improves:

- More stable performance
- Lower read cost
- Predictable paging behavior

### 7) Production dependency vulnerability debt

What we found:

- `npm audit --omit=dev` reported:
  - 48 total production vulnerabilities
  - 47 high
  - 1 moderate
- Most are in AWS SDK dependency chains in current lockfile.

Why this matters (plain language):

- Vulnerable dependency chains increase risk over time and can become a compliance blocker.

Breaking change recommendation:

- Plan a dependency remediation cycle, including lockfile refresh and verification.

What implementation usually involves:

- Upgrading direct dependencies
- Regenerating lockfiles
- Running build + runtime smoke tests

What improves:

- Better security baseline
- Fewer known vulnerable transitive packages

## Route-Specific Note: `/t` Internal SMS Route

This route was specifically reviewed because it is intended to be internal and non-indexable.

Current status:

- Page includes `noindex, nofollow` in `src/pages/t/index.astro:6`.
- Sitemap filter excludes `/t` and `/admin` paths in `astro.config.mjs:52-68`.

Conclusion:

- No immediate indexing leak was found in generated sitemap output during this audit.
- Future changes touching sitemap filters or route rewrites should be reviewed carefully.

## Decision Framework (How To Choose What To Do First)

If prioritizing by risk and impact, recommended order:

1. Perimeter/auth redesign for public endpoints
2. Admin auth replacement + IAM least-privilege hardening
3. SSRF protection in attachment handling
4. One-time SMS token consumption
5. DynamoDB query model migration for admin leads
6. Dependency remediation cycle

## Learning Notes (Quick Glossary)

- Breaking change: a change that requires clients, operators, or workflows to adapt.
- CORS: browser policy control, not a true authentication system.
- SSRF: tricking a server into making requests it should not make.
- IAM least privilege: give only the exact permissions needed, no more.
- DynamoDB Scan vs Query: Scan is broad and expensive; Query is targeted and scalable.

## Suggested Next Step

For each item above, decide:

1. Risk tolerance if deferred
2. Owner
3. Target quarter
4. Migration plan (if user-facing behavior will change)
