# Redirect Map (Legacy -> New)

`config/redirects.json` is the source of truth for production redirects.
AWS Amplify Hosting `customRules` are the applied runtime state and should be
updated from the repo with:

```bash
npm run sync:amplify-redirects
```

To verify AWS matches the repo without changing anything:

```bash
npm run check:amplify-redirects
```

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

- `amplify.yml` is intentionally build-only and should not contain duplicate
  redirect rules.
- These rules are applied to **AWS Amplify -> Hosting -> Rewrites & redirects**.
- Do not attempt path redirects in Route 53 (DNS cannot issue HTTP status codes).
