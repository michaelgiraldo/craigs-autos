import { BUICK_EIGHT } from '../projects/buick-eight.js';
import { PORSCHE_BOXSTER_S_SEAT_PROJECT } from '../projects/porsche-boxster-s-seat-project.js';
import { CAR_SEATS_GALLERY } from './car-seats.js';
import { CAR_SEATS_BEFORE_AFTER } from './car-seats-before-after.js';
import { MOTORCYCLE_SEATS_GALLERY } from './motorcycle-seats.js';

const findById = (items, id) => items.find((item) => item.id === id);
const findProjectImage = (project, id) => project.images?.find((image) => image.id === id);

const GENERIC_SEAT_ALT = {
	en: 'Car seat upholstery example.',
	es: 'Ejemplo de tapiceria de asiento de auto.',
	vi: 'Vi du boc ghe xe hoi.',
	'zh-hans': '汽车座椅内饰案例。',
	tl: 'Halimbawa ng upholstery ng upuan ng sasakyan.',
	ko: '자동차 시트 업홀스터리 사례.',
	hi: 'कार सीट अपहोल्स्ट्री उदाहरण।',
	pa: 'ਕਾਰ ਸੀਟ ਅਪਹੋਲਸਟਰੀ ਉਦਾਹਰਨ।',
	'pt-br': 'Exemplo de estofamento de banco automotivo.',
	'zh-hant': '汽車座椅內裝案例。',
	ja: '車のシート張り替え事例。',
	ar: 'مثال على تنجيد مقعد سيارة.',
	ru: 'Пример перетяжки автомобильного сиденья.',
	ta: 'கார் சீட் உள்வடிவு உதாரணம்.',
};

const GENERIC_SEAT_CAPTION = {
	en: 'Car seat upholstery example.',
	es: 'Ejemplo de tapiceria de asiento.',
	vi: 'Vi du boc ghe xe.',
	'zh-hans': '座椅翻新案例。',
	tl: 'Halimbawa ng seat upholstery.',
	ko: '시트 업홀스터리 사례.',
	hi: 'सीट अपहोल्स्ट्री उदाहरण।',
	pa: 'ਸੀਟ ਅਪਹੋਲਸਟਰੀ ਉਦਾਹਰਨ।',
	'pt-br': 'Exemplo de estofamento de banco.',
	'zh-hant': '座椅翻新案例。',
	ja: 'シート張り替え事例。',
	ar: 'مثال على تنجيد المقاعد.',
	ru: 'Пример перетяжки сидений.',
	ta: 'சீட் உள்வடிவு உதாரணம்.',
};

const GENERIC_MOTORCYCLE_ALT = {
	en: 'Motorcycle seat upholstery example.',
	es: 'Ejemplo de tapiceria de asiento de motocicleta.',
	vi: 'Vi du boc yen xe may.',
	'zh-hans': '摩托车座椅内饰案例。',
	tl: 'Halimbawa ng upholstery ng upuan ng motorsiklo.',
	ko: '오토바이 시트 업홀스터리 사례.',
	hi: 'मोटरसाइकिल सीट अपहोल्स्ट्री उदाहरण।',
	pa: 'ਮੋਟਰਸਾਈਕਲ ਸੀਟ ਅਪਹੋਲਸਟਰੀ ਉਦਾਹਰਨ।',
	'pt-br': 'Exemplo de estofamento de banco de motocicleta.',
	'zh-hant': '摩托車座椅內裝案例。',
	ja: 'バイクシート張り替え事例。',
	ar: 'مثال على تنجيد مقعد دراجة نارية.',
	ru: 'Пример перетяжки сиденья мотоцикла.',
	ta: 'மோட்டார் சைக்கிள் சீட் உள்வடிவு உதாரணம்.',
};

const GENERIC_MOTORCYCLE_CAPTION = {
	en: 'Motorcycle seat upholstery example.',
	es: 'Ejemplo de asiento de motocicleta tapizado.',
	vi: 'Vi du yen xe may boc lai.',
	'zh-hans': '摩托车座椅翻新案例。',
	tl: 'Halimbawa ng reupholstery ng upuan ng motorsiklo.',
	ko: '오토바이 시트 재커버 사례.',
	hi: 'मोटरसाइकिल सीट री-अपहोल्स्ट्री उदाहरण।',
	pa: 'ਮੋਟਰਸਾਈਕਲ ਸੀਟ ਰੀ-ਅਪਹੋਲਸਟਰੀ ਉਦਾਹਰਨ।',
	'pt-br': 'Exemplo de reestofamento de banco de motocicleta.',
	'zh-hant': '摩托車座椅翻新案例。',
	ja: 'バイクシート張り替え事例。',
	ar: 'مثال على إعادة تنجيد مقعد الدراجة النارية.',
	ru: 'Пример перетяжки сиденья мотоцикла.',
	ta: 'மோட்டார் சைக்கிள் சீட் மீள் உள்வடிவு உதாரணம்.',
};

const withSeatCopy = (item) =>
	item
		? {
				...item,
				alt: { ...GENERIC_SEAT_ALT, en: item.alt?.en ?? GENERIC_SEAT_ALT.en },
				caption: { ...GENERIC_SEAT_CAPTION, en: item.caption?.en ?? GENERIC_SEAT_CAPTION.en },
			}
		: null;

const withMotorcycleCopy = (item) =>
	item
		? {
				...item,
				alt: { ...GENERIC_MOTORCYCLE_ALT, en: item.alt?.en ?? GENERIC_MOTORCYCLE_ALT.en },
				caption: { ...GENERIC_MOTORCYCLE_CAPTION, en: item.caption?.en ?? GENERIC_MOTORCYCLE_CAPTION.en },
			}
		: null;


export const HOME_SHOWCASE_IMAGES = [
	findProjectImage(PORSCHE_BOXSTER_S_SEAT_PROJECT, 'door-panel'),
	findProjectImage(BUICK_EIGHT, 'headliner'),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'custom-seat-set-two-tone-upholstery')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'classic-rear-bench-seat-upholstery')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'classic-red-bench-seat-detail')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'suv-diamond-stitched-seat-interior')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'red-black-classic-front-seats-interior')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'recaro-classic-bucket-seat-front-view')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'rv-captain-seat-upholstery-installed')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'boat-seat-black-vinyl-upholstery')),
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'motorcycle-seat-upholstery-green-finish')),
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'ktm-orange-motorcycle-seat-top-view')),
].filter(Boolean);

export const CAR_SEATS_ALL_IMAGES = [
	...CAR_SEATS_GALLERY.map(withSeatCopy),
].filter(Boolean);

export const SERVICE_GALLERY_HIGHLIGHT_IMAGES = [
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'sedan-front-seats-reupholstery-installed')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'custom-seat-set-two-tone-upholstery')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'recaro-classic-bucket-seat-front-view')),
	withSeatCopy(findById(CAR_SEATS_GALLERY, 'red-black-classic-front-seats-interior')),
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'motorcycle-seat-upholstery-green-finish')),
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'ktm-orange-motorcycle-seat-top-view')),
	findProjectImage(PORSCHE_BOXSTER_S_SEAT_PROJECT, 'front-seats-installed'),
	findProjectImage(BUICK_EIGHT, 'front-seats'),
].filter(Boolean);

export const MOTORCYCLE_SEAT_HIGHLIGHT_IMAGES = [
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'motorcycle-seat-upholstery-green-finish')),
	withMotorcycleCopy(findById(MOTORCYCLE_SEATS_GALLERY, 'ktm-orange-motorcycle-seat-top-view')),
].filter(Boolean);

export const BEFORE_AFTER_SHOWCASE_PAIRS = CAR_SEATS_BEFORE_AFTER;

export const SHOWCASE_COPY = {
	home: {
		title: {
			en: 'Upholstery examples',
			es: 'Ejemplos de tapiceria',
			vi: 'Vi du boc ghe',
			'zh-hans': '内饰案例',
			tl: 'Mga halimbawa ng upholstery',
			ko: '업홀스터리 작업 사례',
			hi: 'अपहोल्स्ट्री उदाहरण',
			pa: 'ਅਪਹੋਲਸਟਰੀ ਉਦਾਹਰਨ',
			'pt-br': 'Exemplos de estofamento',
			'zh-hant': '內裝案例',
			ja: '張り替え事例',
			ar: 'أمثلة لأعمال التنجيد',
			ru: 'Примеры перетяжки',
			ta: 'உள்வடிவு உதாரணங்கள்',
		},
	},
	carSeats: {
		highlightTitle: {
			en: 'Car seat gallery',
			es: 'Galeria de asientos',
			vi: 'Thu vien ghe xe',
			'zh-hans': '座椅案例',
			tl: 'Gallery ng upuan ng sasakyan',
			ko: '자동차 시트 갤러리',
			hi: 'कार सीट गैलरी',
			pa: 'ਕਾਰ ਸੀਟ ਗੈਲਰੀ',
			'pt-br': 'Galeria de bancos automotivos',
			'zh-hant': '座椅案例',
			ja: 'シート施工ギャラリー',
			ar: 'معرض مقاعد السيارات',
			ru: 'Галерея автосидений',
			ta: 'கார் சீட் கேலரி',
		},
		beforeAfterTitle: {
			en: 'Before and after seat examples',
			es: 'Ejemplos de asientos antes y despues',
			vi: 'Vi du ghe truoc va sau',
			'zh-hans': '座椅前后对比',
			tl: 'Mga halimbawa ng upuan bago at pagkatapos',
			ko: '시트 작업 전후 사례',
			hi: 'सीट पहले और बाद के उदाहरण',
			pa: 'ਸੀਟ ਪਹਿਲਾਂ ਅਤੇ ਬਾਅਦ ਦੇ ਉਦਾਹਰਨ',
			'pt-br': 'Exemplos de bancos antes e depois',
			'zh-hant': '座椅前後對比',
			ja: 'シートの施工前後事例',
			ar: 'أمثلة قبل وبعد لمقاعد السيارات',
			ru: 'Примеры сидений до и после',
			ta: 'சீட் முன் மற்றும் பின் உதாரணங்கள்',
		},
	},
	gallery: {
		highlightTitle: {
			en: 'Service gallery highlights',
			es: 'Destacados de la galeria de servicios',
			vi: 'Diem nhan thu vien dich vu',
			'zh-hans': '服务案例精选',
			tl: 'Mga tampok sa gallery ng serbisyo',
			ko: '서비스 갤러리 하이라이트',
			hi: 'सेवा गैलरी मुख्य उदाहरण',
			pa: 'ਸੇਵਾ ਗੈਲਰੀ ਮੁੱਖ ਉਦਾਹਰਨ',
			'pt-br': 'Destaques da galeria de servicos',
			'zh-hant': '服務案例精選',
			ja: 'サービス施工の注目例',
			ar: 'أبرز صور معرض الخدمات',
			ru: 'Ключевые примеры из галереи услуг',
			ta: 'சேவை கேலரி முக்கிய உதாரணங்கள்',
		},
		beforeAfterTitle: {
			en: 'Before and after seat examples',
			es: 'Ejemplos de asientos antes y despues',
			vi: 'Vi du ghe truoc va sau',
			'zh-hans': '座椅前后对比',
			tl: 'Mga halimbawa ng upuan bago at pagkatapos',
			ko: '시트 작업 전후 사례',
			hi: 'सीट पहले और बाद के उदाहरण',
			pa: 'ਸੀਟ ਪਹਿਲਾਂ ਅਤੇ ਬਾਅਦ ਦੇ ਉਦਾਹਰਨ',
			'pt-br': 'Exemplos de bancos antes e depois',
			'zh-hant': '座椅前後對比',
			ja: 'シートの施工前後事例',
			ar: 'أمثلة قبل وبعد لمقاعد السيارات',
			ru: 'Примеры сидений до и после',
			ta: 'சீட் முன் மற்றும் பின் உதாரணங்கள்',
		},
	},
	motorcycleSeats: {
		highlightTitle: {
			en: 'Motorcycle seat examples',
			es: 'Ejemplos de asientos de motocicleta',
			vi: 'Vi du yen xe may',
			'zh-hans': '摩托车座椅案例',
			tl: 'Mga halimbawa ng upuan ng motorsiklo',
			ko: '오토바이 시트 사례',
			hi: 'मोटरसाइकिल सीट उदाहरण',
			pa: 'ਮੋਟਰਸਾਈਕਲ ਸੀਟ ਉਦਾਹਰਨ',
			'pt-br': 'Exemplos de bancos de motocicleta',
			'zh-hant': '摩托車座椅案例',
			ja: 'バイクシート事例',
			ar: 'أمثلة لمقاعد الدراجات النارية',
			ru: 'Примеры сидений мотоцикла',
			ta: 'மோட்டார் சைக்கிள் சீட் உதாரணங்கள்',
		},
	},
};
