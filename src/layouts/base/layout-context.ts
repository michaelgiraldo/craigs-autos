import type { HreflangLink, LanguageLink, LocaleKey, LocaleMap, NavItem } from '../../types/site';
import {
  BRAND_NAME,
  BUSINESS_COPY,
  LOCALES,
  LOCALE_ORDER,
  NAV_LABELS,
  SITE,
  UI_COPY,
} from '../../lib/site-data.js';
import { buildEstimateEmailHref } from '../../lib/email-draft.js';
import { getPageSocialCard } from '../../lib/social-cards/getPageSocialCard.js';
import {
  buildHeaderNavStructure,
  type HeaderNavStructure,
  NAV_ITEM_ORDER,
} from '../../features/navigation/nav-structure';
import {
  getPageLabel,
  getPagePath,
  getPageTranslation,
  getTranslations,
} from '../../lib/site-data/page-registry.js';
import { buildStructuredData } from './structured-data';

export interface LayoutProps {
  title: string;
  description?: string;
  canonicalPath?: string;
  locale?: LocaleKey;
  lang?: string;
  translations?: LocaleMap<string>;
  pageKey?: string;
  noindex?: boolean;
  disableLeadWidgets?: boolean;
  disableCustomerContactActions?: boolean;
}

export type BaseLayoutContext = HeaderNavStructure & {
  brandName: string;
  canonicalPath: string;
  canonicalUrl: string;
  currentLanguageLabel: string;
  emailHref: string;
  generator: string;
  gtmAllowedOnPage: boolean;
  gtmId: string;
  gtmPageContext: {
    event: 'page_context';
    locale: LocaleKey;
    pageKey: string | null;
    canonical: string;
  };
  hreflangLinks: HreflangLink[];
  languageLinks: LanguageLink[];
  lang: string;
  locale: LocaleKey;
  localeBaseHref: string;
  customerContactActionsAllowedOnPage: boolean;
  leadWidgetsAllowedOnPage: boolean;
  mapsHref: string;
  mobilePrimaryNav: NavItem[];
  mobileSecondaryNav: NavItem[];
  navItems: NavItem[];
  noindex: boolean;
  ogImageAlt: string;
  ogImageHeight: string;
  ogImageUrl: string;
  ogImageWidth: string;
  ogLocale: string;
  ogLocaleAlternates: string[];
  pageDescription: string;
  servicesLabel: string;
  siteData: typeof SITE;
  smsHref: string;
  socialDescription: string;
  socialTitle: string;
  structuredData: Record<string, unknown>;
  textDirection: 'ltr' | 'rtl';
  title: string;
  ui: (typeof UI_COPY)[keyof typeof UI_COPY];
  xDefaultHref: string;
};

const OG_LOCALE_BY_KEY: Partial<Record<LocaleKey, string>> = {
  en: 'en_US',
  es: 'es_ES',
  vi: 'vi_VN',
  'zh-hans': 'zh_CN',
  tl: 'tl_PH',
  id: 'id_ID',
  fa: 'fa_IR',
  te: 'te_IN',
  fr: 'fr_FR',
  ko: 'ko_KR',
  hi: 'hi_IN',
  pa: 'pa_IN',
  'pt-br': 'pt_BR',
  'zh-hant': 'zh_TW',
  ja: 'ja_JP',
  ar: 'ar_AR',
  ru: 'ru_RU',
  ta: 'ta_IN',
};

function resolveLayoutProps(props: unknown): LayoutProps {
  const candidate =
    props && typeof props === 'object' && 'frontmatter' in props
      ? (props as { frontmatter?: unknown }).frontmatter
      : props;

  return (candidate ?? {}) as LayoutProps;
}

function buildLanguageLink(args: {
  key: LocaleKey;
  resolvedTranslations: LocaleMap<string>;
}): LanguageLink {
  const localeMeta = LOCALES[args.key];
  const nativeLabel = localeMeta.nativeLabel ?? localeMeta.label;
  const englishLabel = localeMeta.englishLabel ?? nativeLabel;
  const menuLabel = nativeLabel === englishLabel ? nativeLabel : `${nativeLabel} (${englishLabel})`;
  const searchLabel =
    `${nativeLabel} ${englishLabel} ${localeMeta.label} ${args.key}`.toLowerCase();

  return {
    key: args.key,
    label: localeMeta.label,
    menuLabel,
    searchLabel,
    href: args.resolvedTranslations[args.key] ?? LOCALES[args.key]?.base ?? LOCALES.en.base,
  };
}

function buildNavItems(locale: LocaleKey): NavItem[] {
  return [...NAV_ITEM_ORDER].flatMap((key) => {
    const href = getPageTranslation(key, locale);
    if (!href) {
      return [];
    }

    return [
      {
        key,
        href,
        label: getPageLabel(key, locale) ?? key,
      },
    ];
  });
}

export function buildBaseLayoutContext(args: {
  generator: string;
  isProduction: boolean;
  props: unknown;
  publicGtmId?: string;
  site?: URL;
}): BaseLayoutContext {
  const {
    title,
    description,
    canonicalPath: canonicalPathProp,
    locale = 'en',
    lang = LOCALES.en.lang,
    translations,
    pageKey,
    noindex = false,
    disableLeadWidgets = false,
    disableCustomerContactActions = false,
  } = resolveLayoutProps(args.props);
  const siteUrl = args.site ?? new URL(SITE.url);
  const localeKeys = LOCALE_ORDER as LocaleKey[];
  const pageTranslations: LocaleMap<string> = translations ?? getTranslations(pageKey ?? 'home');
  const canonicalPath = canonicalPathProp ?? pageTranslations[locale] ?? LOCALES.en.base;
  const canonicalUrl = new URL(canonicalPath, siteUrl).toString();
  const homePath = getPagePath('home', locale);
  const localeBaseHref = LOCALES[locale]?.base ?? LOCALES.en.base;
  const ui = UI_COPY[locale] ?? UI_COPY.en;
  const pageDescription =
    typeof description === 'string' && description.trim().length > 0
      ? description.trim()
      : (BUSINESS_COPY[locale] ?? BUSINESS_COPY.en).description;
  const socialCard = getPageSocialCard({
    pageKey: noindex ? 'home' : (pageKey ?? 'home'),
    locale,
  });
  const mapsQuery = encodeURIComponent(
    `${SITE.address.street}, ${SITE.address.city}, ${SITE.address.region} ${SITE.address.postalCode}`,
  );
  const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;
  const appleMapsHref = SITE.appleMapsUrl;
  const emailHref = buildEstimateEmailHref({
    siteEmail: SITE.email,
    ui,
    pageTitle: title,
    languageLabel: LOCALES[locale]?.nativeLabel ?? locale,
    pageUrl: canonicalUrl,
  });
  const resolvedTranslations: LocaleMap<string> = {};
  for (const key of localeKeys) {
    resolvedTranslations[key] = pageTranslations?.[key] ?? LOCALES[key].base;
  }

  const hreflangLocaleKeys = localeKeys.filter((key) => Boolean(pageTranslations?.[key]));
  const hreflangLinks: HreflangLink[] = hreflangLocaleKeys.map((key) => ({
    hreflang: LOCALES[key].hreflang,
    href: new URL(pageTranslations[key] ?? LOCALES[key].base, siteUrl).toString(),
  }));
  const navItems = buildNavItems(locale);
  const customerContactActionsAllowedOnPage = !disableCustomerContactActions;
  const visibleNavItems = customerContactActionsAllowedOnPage
    ? navItems
    : navItems.filter((item) => item.key !== 'requestQuote');
  const resolvedHeaderNav = buildHeaderNavStructure(
    Object.fromEntries(visibleNavItems.map((item) => [item.key, item])),
  );
  const navLabels = NAV_LABELS[locale] ?? NAV_LABELS.en;
  const fallbackNavLabels = NAV_LABELS.en ?? {};
  const gtmId = typeof args.publicGtmId === 'string' ? args.publicGtmId.trim() : '';
  const gtmEnabled =
    args.isProduction && /^GTM-[A-Z0-9]{6,20}$/i.test(gtmId) && !/disabled/i.test(gtmId);
  const gtmAllowedOnPage = gtmEnabled && !noindex;
  const leadWidgetsAllowedOnPage = !disableLeadWidgets && !noindex && pageKey !== 'admin';

  return {
    ...resolvedHeaderNav,
    brandName: BRAND_NAME,
    canonicalPath,
    canonicalUrl,
    currentLanguageLabel: LOCALES[locale]?.label ?? LOCALES.en.label,
    emailHref,
    generator: args.generator,
    gtmAllowedOnPage,
    gtmId,
    gtmPageContext: {
      event: 'page_context',
      locale,
      pageKey: pageKey ?? null,
      canonical: canonicalUrl,
    },
    hreflangLinks,
    languageLinks: localeKeys.map((key) => buildLanguageLink({ key, resolvedTranslations })),
    lang,
    locale,
    localeBaseHref,
    customerContactActionsAllowedOnPage,
    leadWidgetsAllowedOnPage,
    mapsHref,
    navItems: visibleNavItems,
    noindex,
    ogImageAlt: socialCard.imageAlt,
    ogImageHeight: '630',
    ogImageUrl: new URL(socialCard.imagePath, siteUrl).toString(),
    ogImageWidth: '1200',
    ogLocale: OG_LOCALE_BY_KEY[locale] ?? 'en_US',
    ogLocaleAlternates: Array.from(
      new Set(
        hreflangLocaleKeys
          .filter((key) => key !== locale)
          .map((key) => OG_LOCALE_BY_KEY[key])
          .filter((value): value is string => Boolean(value)),
      ),
    ),
    pageDescription,
    servicesLabel: navLabels.services ?? fallbackNavLabels.services ?? 'Services',
    siteData: SITE,
    smsHref: `sms:${SITE.phone}`,
    socialDescription: socialCard.description,
    socialTitle: socialCard.title,
    structuredData: buildStructuredData({
      appleMapsHref,
      canonicalUrl,
      homePath,
      lang,
      locale,
      logoUrl: new URL('/brand/logo-512.png', siteUrl).toString(),
      mapsHref,
      pageDescription,
      pageKey,
      siteUrl,
      title,
    }),
    textDirection: locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr',
    title,
    ui,
    xDefaultHref: new URL(
      pageTranslations?.en ?? canonicalPath ?? LOCALES.en.base,
      siteUrl,
    ).toString(),
  };
}
