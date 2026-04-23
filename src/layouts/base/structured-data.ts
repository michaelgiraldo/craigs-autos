import type { LocaleKey } from '../../types/site';
import buickFrontSeats from '../../assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-front-seats.jpg';
import buickHeadliner from '../../assets/images/projects/buick-eight/buick-eight-classic-car-upholstery-headliner.jpg';
import porscheDoorPanel from '../../assets/images/projects/porsche-boxster-s-seat-project/porsche-boxster-s-seat-upholstery-door-panel.jpg';
import skeeterBoatCockpit from '../../assets/images/projects/skeeter-boat-upholstery-marine-carpet-installation/skeeter-boat-reupholstered-seats-marine-carpet-cockpit-overview.jpg';
import boatSeatBlackVinyl from '../../assets/images/services/car-seats/boat-seat-black-vinyl-upholstery.jpg';
import customSeatSetTwoTone from '../../assets/images/services/car-seats/custom-seat-set-two-tone-upholstery.jpg';
import ktmOrangeMotorcycleSeatTopView from '../../assets/images/services/motorcycle-seats/ktm-orange-motorcycle-seat-top-view.jpg';
import { BRAND_NAME, BUSINESS_COPY, LOCALES, SITE } from '../../lib/site-data.js';
import { getPageLabel, getPageTranslation } from '../../lib/site-data/page-registry.js';

type ServiceNode = {
  '@type': 'Service';
  '@id': string;
  name: string;
  url: string;
  provider: { '@id': string };
};

type BuildStructuredDataArgs = {
  appleMapsHref: string;
  canonicalUrl: string;
  homePath: string;
  lang: string;
  locale: LocaleKey;
  logoUrl: string;
  mapsHref: string;
  pageDescription: string;
  pageKey?: string;
  siteUrl: URL;
  title: string;
};

const SERVICE_KEYS = [
  'autoUpholstery',
  'carSeats',
  'dashboard',
  'boatUpholstery',
  'headliners',
  'convertibleTops',
  'classicCars',
  'commercialFleet',
];

const BUSINESS_IMAGE_ASSETS = [
  buickFrontSeats,
  buickHeadliner,
  porscheDoorPanel,
  skeeterBoatCockpit,
  customSeatSetTwoTone,
  boatSeatBlackVinyl,
  ktmOrangeMotorcycleSeatTopView,
];

function buildBusinessImages(siteUrl: URL): string[] {
  return Array.from(
    new Set(BUSINESS_IMAGE_ASSETS.map((image) => new URL(image.src, siteUrl).toString())),
  );
}

function buildServiceNodes(args: {
  businessId: string;
  locale: LocaleKey;
  siteUrl: URL;
}): Partial<Record<string, ServiceNode>> {
  return Object.fromEntries(
    SERVICE_KEYS.flatMap((key) => {
      const href = getPageTranslation(key, args.locale);
      if (!href) {
        return [];
      }

      return [
        [
          key,
          {
            '@type': 'Service',
            '@id': `${new URL(href, args.siteUrl).toString()}#service`,
            name: getPageLabel(key, args.locale) ?? key,
            url: new URL(href, args.siteUrl).toString(),
            provider: { '@id': args.businessId },
          },
        ],
      ];
    }),
  );
}

export function buildStructuredData(args: BuildStructuredDataArgs): Record<string, unknown> {
  const business = BUSINESS_COPY[args.locale] ?? BUSINESS_COPY.en;
  const businessId = new URL('#business', args.siteUrl).toString();
  const websiteId = new URL(
    `${LOCALES[args.locale]?.base ?? LOCALES.en.base}#website`,
    args.siteUrl,
  ).toString();
  const webpageId = `${args.canonicalUrl}#webpage`;
  const breadcrumbId = `${args.canonicalUrl}#breadcrumb`;
  const serviceNodesByKey = buildServiceNodes({
    businessId,
    locale: args.locale,
    siteUrl: args.siteUrl,
  });
  const pageServiceNode = args.pageKey ? serviceNodesByKey[args.pageKey] : null;
  const mainEntityId = pageServiceNode ? pageServiceNode['@id'] : businessId;

  const businessNode = {
    '@type': ['LocalBusiness'],
    '@id': businessId,
    name: business.name,
    legalName: BRAND_NAME,
    description: business.description,
    url: new URL(args.homePath, args.siteUrl).toString(),
    logo: args.logoUrl,
    image: buildBusinessImages(args.siteUrl),
    telephone: SITE.phone,
    email: SITE.email,
    hasMap: args.appleMapsHref ? [args.mapsHref, args.appleMapsHref] : args.mapsHref,
    sameAs: SITE.sameAs,
    // Self-serving LocalBusiness review snippets are typically ineligible for star rich results.
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE.geo.latitude,
      longitude: SITE.geo.longitude,
    },
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressRegion: SITE.address.region,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.country,
    },
    openingHoursSpecification: SITE.hours.map((range) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: range.days,
      opens: range.opens,
      closes: range.closes,
    })),
    areaServed: 'San Jose, CA',
  };

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: getPageLabel('home', args.locale) ?? 'Home',
      item: new URL(args.homePath, args.siteUrl).toString(),
    },
  ];

  if (args.pageKey && args.pageKey !== 'home') {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 2,
      name: getPageLabel(args.pageKey, args.locale) ?? args.title,
      item: args.canonicalUrl,
    });
  }

  const websiteNode = {
    '@type': 'WebSite',
    '@id': websiteId,
    url: new URL(LOCALES[args.locale]?.base ?? LOCALES.en.base, args.siteUrl).toString(),
    name: BRAND_NAME,
    publisher: { '@id': businessId },
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId,
    itemListElement: breadcrumbItems,
  };

  const webpageNode = {
    '@type': 'WebPage',
    '@id': webpageId,
    url: args.canonicalUrl,
    name: args.title,
    description: args.pageDescription,
    inLanguage: args.lang,
    isPartOf: { '@id': websiteId },
    about: { '@id': businessId },
    mainEntity: { '@id': mainEntityId },
    breadcrumb: { '@id': breadcrumbId },
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      businessNode,
      websiteNode,
      webpageNode,
      breadcrumbNode,
      ...Object.values(serviceNodesByKey),
    ],
  };
}
