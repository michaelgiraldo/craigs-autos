export const BRAND_NAME = "Craig's Auto Upholstery";

export const SITE = {
	url: 'https://craigs.autos',
	phone: '+14083793820',
	displayPhone: '(408) 379-3820',
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

export const LOCALE_ORDER = ['en', 'es', 'vi', 'zh'];

export const LOCALES = {
	en: { label: 'EN', lang: 'en', hreflang: 'en', base: '/en/' },
	es: { label: 'ES', lang: 'es', hreflang: 'es', base: '/es/' },
	vi: { label: 'VI', lang: 'vi', hreflang: 'vi', base: '/vi/' },
	zh: { label: '中文', lang: 'zh-Hans', hreflang: 'zh-Hans', base: '/zh/' },
};

export const PAGE_PATHS = {
	home: { en: '/en/', es: '/es/', vi: '/vi/', zh: '/zh/' },
	autoUpholstery: {
		en: '/en/auto-upholstery/',
		es: '/es/tapiceria-automotriz/',
		vi: '/vi/boc-noi-that-o-to/',
		zh: '/zh/汽车内饰/',
	},
	carSeats: { en: '/en/car-seats/', es: '/es/asientos/', vi: '/vi/ghe-xe/', zh: '/zh/汽车座椅/' },
	headliners: {
		en: '/en/headliners/',
		es: '/es/techos-interiores/',
		vi: '/vi/tran-xe/',
		zh: '/zh/车顶内衬/',
	},
	convertibleTops: {
		en: '/en/convertible-tops/',
		es: '/es/capotas-convertibles/',
		vi: '/vi/mui-xe-mui-tran/',
		zh: '/zh/敞篷车顶/',
	},
	classicCars: {
		en: '/en/classic-cars/',
		es: '/es/autos-clasicos/',
		vi: '/vi/xe-co/',
		zh: '/zh/经典汽车/',
	},
	gallery: { en: '/en/gallery/', es: '/es/galeria/', vi: '/vi/thu-vien/', zh: '/zh/图库/' },
	reviews: { en: '/en/reviews/', es: '/es/opiniones/', vi: '/vi/danh-gia/', zh: '/zh/评价/' },
	contact: { en: '/en/contact/', es: '/es/contacto/', vi: '/vi/lien-he/', zh: '/zh/联系/' },
};

export const BUSINESS_COPY = {
	en: {
		name: BRAND_NAME,
		description:
			'Family-owned auto upholstery in San Jose, CA specializing in seats, headliners, convertible tops, and classic interiors.',
		services: [
			'Auto upholstery',
			'Seat repair and reupholstery',
			'Headliners and interior trim',
			'Convertible tops',
			'Classic car interiors',
		],
	},
	es: {
		name: "Tapicería Automotriz Craig's",
		description:
			'Tapicería automotriz familiar en San José, CA con asientos, techos interiores, capotas convertibles y clásicos.',
		services: [
			'Tapicería automotriz',
			'Reparación y retapizado de asientos',
			'Techos interiores y molduras',
			'Capotas convertibles',
			'Interiores de autos clásicos',
		],
	},
	vi: {
		name: "Bọc Nội Thất Ô Tô Craig's",
		description:
			'Cơ sở bọc nội thất ô tô gia đình tại San Jose, CA; ghế, trần xe, mui xe và nội thất xe cổ.',
		services: [
			'Bọc nội thất ô tô',
			'Sửa chữa và bọc lại ghế',
			'Trần xe và ốp nội thất',
			'Mui xe mui trần',
			'Nội thất xe cổ',
		],
	},
	zh: {
		name: "Craig's 汽车内饰",
		description: '位于圣何塞的家族汽车内饰店，提供座椅、车顶内衬、敞篷车顶与经典车内饰修复。',
		services: ['汽车内饰', '座椅修复与重新包覆', '车顶内衬与内饰饰板', '敞篷车顶', '经典汽车内饰'],
	},
};

export const NAV_LABELS = {
	en: {
		home: 'Home',
		autoUpholstery: 'Auto Upholstery',
		carSeats: 'Car Seats',
		headliners: 'Headliners',
		convertibleTops: 'Convertible Tops',
		classicCars: 'Classic Cars',
		gallery: 'Gallery',
		reviews: 'Reviews',
		contact: 'Contact',
	},
	es: {
		home: 'Inicio',
		autoUpholstery: 'Tapicería automotriz',
		carSeats: 'Asientos',
		headliners: 'Techos interiores',
		convertibleTops: 'Capotas',
		classicCars: 'Autos clásicos',
		gallery: 'Galería',
		reviews: 'Opiniones',
		contact: 'Contacto',
	},
	vi: {
		home: 'Trang chủ',
		autoUpholstery: 'Bọc nội thất ô tô',
		carSeats: 'Ghế xe',
		headliners: 'Trần xe',
		convertibleTops: 'Mui xe',
		classicCars: 'Xe cổ',
		gallery: 'Thư viện',
		reviews: 'Đánh giá',
		contact: 'Liên hệ',
	},
	zh: {
		home: '首页',
		autoUpholstery: '汽车内饰',
		carSeats: '汽车座椅',
		headliners: '车顶内衬',
		convertibleTops: '敞篷车顶',
		classicCars: '经典汽车',
		gallery: '图库',
		reviews: '评价',
		contact: '联系',
	},
};

	export const UI_COPY = {
		en: {
			callCta: 'Call',
			textCta: 'Text',
			directionsCta: 'Directions',
			menuLabel: 'Menu',
			languageLabel: 'Language',
			quickActionsLabel: 'Quick actions',
			hoursLabel: 'Hours',
			hoursSummary: 'Mon–Fri 8:00 AM–5:00 PM · Sat 8:00 AM–2:00 PM · Sun Closed',
			reviewsLabel: 'Reviews',
			yelpLabel: 'Yelp',
		googleLabel: 'Google',
		appleMapsLabel: 'Apple Maps',
		trust: ['60+ years in San Jose', 'Family-owned', 'Automotive upholstery only'],
	},
		es: {
			callCta: 'Llamar',
			textCta: 'Texto',
			directionsCta: 'Cómo llegar',
			menuLabel: 'Menú',
			languageLabel: 'Idioma',
			quickActionsLabel: 'Acciones rápidas',
			hoursLabel: 'Horario',
			hoursSummary: 'Lun–Vie 8:00–17:00 · Sáb 8:00–14:00 · Dom Cerrado',
			reviewsLabel: 'Reseñas',
			yelpLabel: 'Yelp',
		googleLabel: 'Google',
		appleMapsLabel: 'Apple Maps',
		trust: ['60+ años en la zona', 'Negocio familiar', 'Solo tapicería automotriz'],
	},
		vi: {
			callCta: 'Gọi',
			textCta: 'Nhắn tin',
			directionsCta: 'Chỉ đường',
			menuLabel: 'Menu',
			languageLabel: 'Ngôn ngữ',
			quickActionsLabel: 'Thao tác nhanh',
			hoursLabel: 'Giờ làm việc',
			hoursSummary: 'Th 2–Th 6 8:00–17:00 · Th 7 8:00–14:00 · CN Nghỉ',
			reviewsLabel: 'Đánh giá',
			yelpLabel: 'Yelp',
		googleLabel: 'Google',
		appleMapsLabel: 'Apple Maps',
		trust: ['Hơn 60 năm', 'Cơ sở gia đình', 'Chỉ bọc nội thất ô tô'],
	},
		zh: {
			callCta: '致电',
			textCta: '短信',
			directionsCta: '导航',
			menuLabel: '菜单',
			languageLabel: '语言',
			quickActionsLabel: '快捷操作',
			hoursLabel: '营业时间',
			hoursSummary: '周一至周五 8:00–17:00 · 周六 8:00–14:00 · 周日 休息',
			reviewsLabel: '评价',
			yelpLabel: 'Yelp',
		googleLabel: 'Google',
		appleMapsLabel: 'Apple 地图',
		trust: ['60多年经验', '家族经营', '专注汽车内饰'],
	},
};

export function getTranslations(key) {
	return PAGE_PATHS[key] ?? PAGE_PATHS.home;
}
