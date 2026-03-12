export const BRAND_NAME = "Craig's Auto Upholstery";

export const SITE = {
	url: 'https://craigs.autos',
	phone: '+14083793820',
	displayPhone: '(408) 379-3820',
	email: 'contact@craigs.autos',
	address: {
		street: '271 Bestor St',
		city: 'San Jose',
		region: 'CA',
		postalCode: '95112',
		country: 'US',
	},
	appleMapsUrl:
		"https://maps.apple.com/place?place-id=I5191F0670292696E&address=271+Bestor+St%2C+San+Jose%2C+CA++95112%2C+United+States&coordinate=37.3241991%2C-121.8734233&name=Craig%27s+Auto+Upholstery&_provider=9902",
	geo: {
		latitude: 37.3241016,
		longitude: -121.8734335,
	},
	hours: [
		{
			days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
			opens: '08:00',
			closes: '17:00',
		},
		{ days: ['Saturday'], opens: '08:00', closes: '14:00' },
	],
	sameAs: [
		'https://www.yelp.com/biz/craigs-auto-upholstery-san-jose',
		'https://share.google/7YeUZX7fufHdKULQN',
	],
};

export const LOCALE_ORDER = [
	'en',
	'es',
	'vi',
	'zh-hans',
	'tl',
	'id',
	'ko',
	'hi',
	'pa',
	'pt-br',
	'zh-hant',
	'ja',
	'ar',
	'ru',
	'ta',
];

export const LOCALES = {
	en: {
		label: 'EN',
		nativeLabel: 'English',
		englishLabel: 'English',
		lang: 'en',
		hreflang: 'en',
		base: '/en/',
	},
	es: {
		label: 'ES',
		nativeLabel: 'Español',
		englishLabel: 'Spanish',
		lang: 'es',
		hreflang: 'es',
		base: '/es/',
	},
	vi: {
		label: 'VI',
		nativeLabel: 'Tiếng Việt',
		englishLabel: 'Vietnamese',
		lang: 'vi',
		hreflang: 'vi',
		base: '/vi/',
	},
	'zh-hans': {
		label: '中文',
		nativeLabel: '中文（简体）',
		englishLabel: 'Simplified Chinese',
		lang: 'zh-Hans',
		hreflang: 'zh-Hans',
		base: '/zh-hans/',
	},
	tl: {
		label: 'Filipino',
		nativeLabel: 'Filipino (Tagalog)',
		englishLabel: 'Filipino (Tagalog)',
		lang: 'tl',
		hreflang: 'tl',
		base: '/tl/',
	},
	id: {
		label: 'ID',
		nativeLabel: 'Bahasa Indonesia',
		englishLabel: 'Indonesian',
		lang: 'id',
		hreflang: 'id',
		base: '/id/',
	},
	ko: {
		label: '한국어',
		nativeLabel: '한국어',
		englishLabel: 'Korean',
		lang: 'ko',
		hreflang: 'ko',
		base: '/ko/',
	},
	hi: {
		label: 'हिन्दी',
		nativeLabel: 'हिन्दी',
		englishLabel: 'Hindi',
		lang: 'hi',
		hreflang: 'hi',
		base: '/hi/',
	},
	pa: {
		label: 'ਪੰਜਾਬੀ',
		nativeLabel: 'ਪੰਜਾਬੀ',
		englishLabel: 'Punjabi',
		lang: 'pa',
		hreflang: 'pa',
		base: '/pa/',
	},
	'pt-br': {
		label: 'Português-BR',
		nativeLabel: 'Português (Brasil)',
		englishLabel: 'Portuguese - Brazil',
		lang: 'pt-BR',
		hreflang: 'pt-BR',
		base: '/pt-br/',
	},
	'zh-hant': {
		label: '中文(繁)',
		nativeLabel: '中文（繁體）',
		englishLabel: 'Traditional Chinese',
		lang: 'zh-Hant',
		hreflang: 'zh-Hant',
		base: '/zh-hant/',
	},
	ja: {
		label: '日本語',
		nativeLabel: '日本語',
		englishLabel: 'Japanese',
		lang: 'ja',
		hreflang: 'ja',
		base: '/ja/',
	},
	ar: {
		label: 'العربية',
		nativeLabel: 'العربية',
		englishLabel: 'Arabic',
		lang: 'ar',
		hreflang: 'ar',
		base: '/ar/',
	},
	ru: {
		label: 'Русский',
		nativeLabel: 'Русский',
		englishLabel: 'Russian',
		lang: 'ru',
		hreflang: 'ru',
		base: '/ru/',
	},
	ta: {
		label: 'தமிழ்',
		nativeLabel: 'தமிழ்',
		englishLabel: 'Tamil',
		lang: 'ta',
		hreflang: 'ta',
		base: '/ta/',
	},
};

const WAVE1_LOCALE_ORDER = ['fa', 'te', 'fr'];
const wave1InsertAt = LOCALE_ORDER.indexOf('ko');
for (const locale of WAVE1_LOCALE_ORDER) {
	if (LOCALE_ORDER.includes(locale)) continue;
	if (wave1InsertAt >= 0) {
		LOCALE_ORDER.splice(LOCALE_ORDER.indexOf('ko'), 0, locale);
	} else {
		LOCALE_ORDER.push(locale);
	}
}

Object.assign(LOCALES, {
	fa: {
		label: 'فارسی',
		nativeLabel: 'فارسی',
		englishLabel: 'Persian',
		lang: 'fa',
		hreflang: 'fa',
		base: '/fa/',
	},
	te: {
		label: 'తెలుగు',
		nativeLabel: 'తెలుగు',
		englishLabel: 'Telugu',
		lang: 'te',
		hreflang: 'te',
		base: '/te/',
	},
	fr: {
		label: 'FR',
		nativeLabel: 'Français',
		englishLabel: 'French',
		lang: 'fr',
		hreflang: 'fr',
		base: '/fr/',
	},
});
