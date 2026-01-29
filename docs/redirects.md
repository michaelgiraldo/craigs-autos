# Redirect Map (Legacy → New)

This document mirrors the active Amplify Hosting custom rules. The **Amplify Console** rules
are the source of truth for live redirects; keep this file in sync for versioned reference.

## Canonical domains

- Old domain: `https://craigsautoandhomeupholstery.com`
- New domain: `https://craigs.autos`

## Active 301 redirects (Amplify)

| Old path | Redirect target |
| --- | --- |
| `/` | `https://craigs.autos/en/` |
| `/index.html` | `https://craigs.autos/en/` |
| `/contact` | `https://craigs.autos/en/contact/` |
| `/gallery` | `https://craigs.autos/en/gallery/` |
| `/about-us` | `https://craigs.autos/en/` |
| `/auto-and-marine-upholstery` | `https://craigs.autos/en/auto-upholstery/` |

## Intentionally not redirected

| Old path | Expected behavior |
| --- | --- |
| `/home-upholstery` | 404 (service retired) |

## Notes

- These rules are configured in **AWS Amplify → Hosting → Rewrites & redirects**.
- Do not attempt path redirects in Route 53 (DNS cannot issue HTTP status codes).
