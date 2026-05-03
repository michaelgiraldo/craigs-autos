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
- Canonical host: `craigs.autos`
- Redirect-only host: `www.craigs.autos`
- Wildcard subdomain hosting is intentionally disabled. Retired hosts should not
  serve the production app.

Desired Amplify/Route 53 domain state lives in `config/amplify-domain.json`.
Verify it after domain changes with:

```bash
npm run check:canonical-domain -- --http
```

## Active 301 redirects (Amplify)

| Source | Redirect target |
| --- | --- |
| `https://www.craigs.autos` | `https://craigs.autos` |
| `/` | `https://craigs.autos/en/` |
| `/index.html` | `https://craigs.autos/en/` |
| `/contact` | `https://craigs.autos/en/contact/` |
| `/gallery` | `https://craigs.autos/en/gallery/` |
| `/about-us` | `https://craigs.autos/en/` |
| `/auto-and-marine-upholstery` | `https://craigs.autos/en/auto-upholstery/` |
| `/en/dashboard-reupholstery` | `https://craigs.autos/en/dashboard/` |
| `/en/dashboard-reupholstery/` | `https://craigs.autos/en/dashboard/` |
| `/es/tapiceria-de-tablero` | `https://craigs.autos/es/tablero/` |
| `/es/tapiceria-de-tablero/` | `https://craigs.autos/es/tablero/` |
| `/vi/boc-tap-lo` | `https://craigs.autos/vi/tap-lo/` |
| `/vi/boc-tap-lo/` | `https://craigs.autos/vi/tap-lo/` |
| `/zh-hans/仪表台内饰` | `https://craigs.autos/zh-hans/仪表台/` |
| `/zh-hans/仪表台内饰/` | `https://craigs.autos/zh-hans/仪表台/` |
| `/tl/tapiseriya-ng-dashboard` | `https://craigs.autos/tl/dashboard/` |
| `/tl/tapiseriya-ng-dashboard/` | `https://craigs.autos/tl/dashboard/` |
| `/id/upholstery-dashboard` | `https://craigs.autos/id/dashboard/` |
| `/id/upholstery-dashboard/` | `https://craigs.autos/id/dashboard/` |
| `/ko/대시보드-내장` | `https://craigs.autos/ko/대시보드/` |
| `/ko/대시보드-내장/` | `https://craigs.autos/ko/대시보드/` |
| `/hi/डैशबोर्ड-अपहोल्स्ट्री` | `https://craigs.autos/hi/डैशबोर्ड/` |
| `/hi/डैशबोर्ड-अपहोल्स्ट्री/` | `https://craigs.autos/hi/डैशबोर्ड/` |
| `/pa/ਡੈਸ਼ਬੋਰਡ-ਅਪਹੋਲਸਟਰੀ` | `https://craigs.autos/pa/ਡੈਸ਼ਬੋਰਡ/` |
| `/pa/ਡੈਸ਼ਬੋਰਡ-ਅਪਹੋਲਸਟਰੀ/` | `https://craigs.autos/pa/ਡੈਸ਼ਬੋਰਡ/` |
| `/pt-br/estofamento-de-painel` | `https://craigs.autos/pt-br/painel/` |
| `/pt-br/estofamento-de-painel/` | `https://craigs.autos/pt-br/painel/` |
| `/zh-hant/儀表板內飾` | `https://craigs.autos/zh-hant/儀表板/` |
| `/zh-hant/儀表板內飾/` | `https://craigs.autos/zh-hant/儀表板/` |
| `/ja/ダッシュボード内装` | `https://craigs.autos/ja/ダッシュボード/` |
| `/ja/ダッシュボード内装/` | `https://craigs.autos/ja/ダッシュボード/` |
| `/ar/تنجيد-لوحة-القيادة` | `https://craigs.autos/ar/لوحة-القيادة/` |
| `/ar/تنجيد-لوحة-القيادة/` | `https://craigs.autos/ar/لوحة-القيادة/` |
| `/ru/перетяжка-панели-приборов` | `https://craigs.autos/ru/панель-приборов/` |
| `/ru/перетяжка-панели-приборов/` | `https://craigs.autos/ru/панель-приборов/` |
| `/ta/டாஷ்போர்டு-உள்வடிவம்` | `https://craigs.autos/ta/டாஷ்போர்டு/` |
| `/ta/டாஷ்போர்டு-உள்வடிவம்/` | `https://craigs.autos/ta/டாஷ்போர்டு/` |
| `/fa/روکش-داشبورد` | `https://craigs.autos/fa/داشبورد/` |
| `/fa/روکش-داشبورد/` | `https://craigs.autos/fa/داشبورد/` |
| `/te/డాష్‌బోర్డ్-అప్హోల్స్టరీ` | `https://craigs.autos/te/డాష్‌బోర్డ్/` |
| `/te/డాష్‌బోర్డ్-అప్హోల్స్టరీ/` | `https://craigs.autos/te/డాష్‌బోర్డ్/` |
| `/fr/garnissage-tableau-de-bord` | `https://craigs.autos/fr/tableau-de-bord/` |
| `/fr/garnissage-tableau-de-bord/` | `https://craigs.autos/fr/tableau-de-bord/` |

## Intentionally not redirected

| Old path | Expected behavior |
| --- | --- |
| `/home-upholstery` | 404 (service retired) |

## Notes

- `amplify.yml` is intentionally build-only and should not contain duplicate
  redirect rules.
- These rules are applied to **AWS Amplify -> Hosting -> Rewrites & redirects**.
- Do not attempt path redirects in Route 53 (DNS cannot issue HTTP status codes).
