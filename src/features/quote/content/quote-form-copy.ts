import { CHAT_COPY } from '../../../lib/site-data.js';
import { LOCALES } from '../../../lib/site-data/core.js';
import { PAGE_LABELS } from '../../../lib/site-data/page-meta.js';
import type { LocaleKey } from '../../../types/site';

type QuoteFormLocaleCopy = {
	title: string;
	description: string;
	vehicleLabel: string;
	namePlaceholder: string;
	phonePlaceholder: string;
	emailPlaceholder: string;
	vehiclePlaceholder: string;
	serviceLabel: string;
	servicePlaceholder: string;
	messageLabel: string;
	messagePlaceholder: string;
	submitLabel: string;
	submittingLabel: string;
	successTitle: string;
	successBody: string;
	errorTitle: string;
	validationInvalidInput: string;
	validationMissingContactMethod: string;
	validationInvalidPhone: string;
	validationInvalidEmail: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	otherServiceLabel: string;
};

export type QuoteFormCopy = {
	kicker: string;
	title: string;
	description: string;
	nameLabel: string;
	namePlaceholder: string;
	phoneLabel: string;
	phonePlaceholder: string;
	emailLabel: string;
	emailPlaceholder: string;
	vehicleLabel: string;
	vehiclePlaceholder: string;
	serviceLabel: string;
	servicePlaceholder: string;
	messageLabel: string;
	messagePlaceholder: string;
	submitLabel: string;
	submittingLabel: string;
	successTitle: string;
	successBody: string;
	errorTitle: string;
	errorBody: string;
	validationInvalidInput: string;
	validationMissingContactMethod: string;
	validationInvalidPhone: string;
	validationInvalidEmail: string;
	validationMissingEndpoint: string;
	validationFallbackError: string;
	serviceOptions: Array<{ value: string; label: string }>;
};

const QUOTE_FORM_COPY: Record<LocaleKey, QuoteFormLocaleCopy> = {
	en: {
		title: 'Tell Us About Your Project',
		description:
			'Tell us what needs repair or upholstery work. If you already have photos, mention that in your message.',
		vehicleLabel: 'Vehicle or item details',
		namePlaceholder: 'Your name',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'name@example.com',
		vehiclePlaceholder: 'e.g. 1969 Camaro SS, motorcycle seat, or boat captain’s chair',
		serviceLabel: 'Service needed',
		servicePlaceholder: 'Select a service',
		messageLabel: 'Tell us about your project',
		messagePlaceholder:
			'Describe what needs repair or upholstery work, the condition, and anything helpful for a quote.',
		submitLabel: 'Submit quote request',
		submittingLabel: 'Submitting...',
		successTitle: 'Thanks. Your request is in.',
		successBody: 'Each quote request is reviewed manually and we will follow up soon.',
		errorTitle: 'We could not send your request.',
		validationInvalidInput: 'Please review the form and try again.',
		validationMissingContactMethod: 'Add a phone number, an email address, or both.',
		validationInvalidPhone: 'Please enter a valid phone number.',
		validationInvalidEmail: 'Please enter a valid email address.',
		validationMissingEndpoint: 'The quote request form is not configured yet. Please try again soon.',
		validationFallbackError: 'We could not submit your quote request. Please try again or call the shop.',
		otherServiceLabel: 'Other / Not sure yet',
	},
	es: {
		title: 'Cuéntanos sobre tu proyecto',
		description:
			'Cuéntanos qué necesita reparación o trabajo de tapicería. Si ya tienes fotos, menciónalo en tu mensaje.',
		vehicleLabel: 'Vehículo o artículo',
		namePlaceholder: 'Tu nombre',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nombre@ejemplo.com',
		vehiclePlaceholder: 'ej. Camaro SS 1969, asiento de moto o silla de lancha',
		serviceLabel: 'Servicio que necesitas',
		servicePlaceholder: 'Selecciona un servicio',
		messageLabel: 'Cuéntanos sobre tu proyecto',
		messagePlaceholder:
			'Describe qué necesita reparación o tapicería, la condición actual y cualquier detalle útil para cotizar.',
		submitLabel: 'Enviar solicitud de cotización',
		submittingLabel: 'Enviando...',
		successTitle: 'Gracias. Tu solicitud ya llegó.',
		successBody: 'Revisamos cada solicitud manualmente y te responderemos pronto.',
		errorTitle: 'No pudimos enviar tu solicitud.',
		validationInvalidInput: 'Revisa el formulario e inténtalo de nuevo.',
		validationMissingContactMethod: 'Agrega un teléfono, un correo electrónico o ambos.',
		validationInvalidPhone: 'Ingresa un número de teléfono válido.',
		validationInvalidEmail: 'Ingresa un correo electrónico válido.',
		validationMissingEndpoint: 'El formulario de cotización todavía no está configurado. Inténtalo de nuevo pronto.',
		validationFallbackError:
			'No pudimos enviar tu solicitud de cotización. Inténtalo de nuevo o llama al taller.',
		otherServiceLabel: 'Otro / Aún no estoy seguro',
	},
	vi: {
		title: 'Hãy cho chúng tôi biết về dự án của bạn',
		description:
			'Hãy cho chúng tôi biết món đồ nào cần sửa chữa hoặc bọc lại. Nếu bạn đã có ảnh, hãy nhắc đến điều đó trong lời nhắn.',
		vehicleLabel: 'Chi tiết xe hoặc món đồ',
		namePlaceholder: 'Tên của bạn',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'ten@vi-du.com',
		vehiclePlaceholder: 'ví dụ: Camaro SS 1969, yên xe máy hoặc ghế thuyền',
		serviceLabel: 'Dịch vụ cần thiết',
		servicePlaceholder: 'Chọn một dịch vụ',
		messageLabel: 'Hãy cho chúng tôi biết về dự án của bạn',
		messagePlaceholder:
			'Mô tả những gì cần sửa chữa hoặc bọc lại, tình trạng hiện tại và bất kỳ chi tiết nào hữu ích cho việc báo giá.',
		submitLabel: 'Gửi yêu cầu báo giá',
		submittingLabel: 'Đang gửi...',
		successTitle: 'Cảm ơn. Chúng tôi đã nhận được yêu cầu của bạn.',
		successBody: 'Mỗi yêu cầu đều được xem thủ công và chúng tôi sẽ liên hệ lại sớm.',
		errorTitle: 'Chúng tôi không thể gửi yêu cầu của bạn.',
		validationInvalidInput: 'Vui lòng kiểm tra lại biểu mẫu và thử lại.',
		validationMissingContactMethod: 'Hãy thêm số điện thoại, địa chỉ email hoặc cả hai.',
		validationInvalidPhone: 'Vui lòng nhập số điện thoại hợp lệ.',
		validationInvalidEmail: 'Vui lòng nhập địa chỉ email hợp lệ.',
		validationMissingEndpoint: 'Biểu mẫu báo giá chưa được cấu hình. Vui lòng thử lại sau.',
		validationFallbackError: 'Không thể gửi yêu cầu báo giá. Vui lòng thử lại hoặc gọi cho cửa hàng.',
		otherServiceLabel: 'Khác / Chưa chắc',
	},
	'zh-hans': {
		title: '告诉我们您的项目情况',
		description: '请告诉我们哪些部位需要维修或重新包覆。如果您已经有照片，也请在留言里说明。',
		vehicleLabel: '车辆或物件详情',
		namePlaceholder: '您的姓名',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: '姓名@示例.com',
		vehiclePlaceholder: '例如：1969 Camaro SS、摩托车座椅或船长椅',
		serviceLabel: '所需服务',
		servicePlaceholder: '请选择服务',
		messageLabel: '请介绍一下您的项目',
		messagePlaceholder: '请描述需要维修或重新包覆的内容、目前状况，以及任何有助于报价的细节。',
		submitLabel: '提交报价请求',
		submittingLabel: '提交中...',
		successTitle: '谢谢。我们已收到您的请求。',
		successBody: '每份请求都会由人工审核，我们会尽快跟进。',
		errorTitle: '我们无法发送您的请求。',
		validationInvalidInput: '请检查表单后重试。',
		validationMissingContactMethod: '请填写电话号码、电子邮箱，或两者都填写。',
		validationInvalidPhone: '请输入有效的电话号码。',
		validationInvalidEmail: '请输入有效的电子邮箱地址。',
		validationMissingEndpoint: '报价表单尚未配置。请稍后再试。',
		validationFallbackError: '我们无法提交您的报价请求。请重试或致电门店。',
		otherServiceLabel: '其他 / 还不确定',
	},
	tl: {
		title: 'Ikuwento ang proyekto mo',
		description:
			'Sabihin sa amin kung ano ang kailangang ayusin o i-upholster. Kung may mga larawan ka na, banggitin iyon sa mensahe.',
		vehicleLabel: 'Detalye ng sasakyan o gamit',
		namePlaceholder: 'Pangalan mo',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'pangalan@halimbawa.com',
		vehiclePlaceholder: 'hal. 1969 Camaro SS, upuan ng motorsiklo, o upuan ng bangka',
		serviceLabel: 'Kailangang serbisyo',
		servicePlaceholder: 'Pumili ng serbisyo',
		messageLabel: 'Ikuwento ang proyekto mo',
		messagePlaceholder:
			'Ilarawan kung ano ang kailangang ayusin o i-upholster, ang kasalukuyang kondisyon, at anumang detalyeng makakatulong sa quote.',
		submitLabel: 'Isumite ang quote request',
		submittingLabel: 'Isinusumite...',
		successTitle: 'Salamat. Natanggap na namin ang request mo.',
		successBody: 'Bawat request ay mano-manong sinusuri at makikipag-ugnayan kami sa lalong madaling panahon.',
		errorTitle: 'Hindi namin maipadala ang request mo.',
		validationInvalidInput: 'Pakisuri ang form at subukang muli.',
		validationMissingContactMethod: 'Magdagdag ng numero ng telepono, email address, o pareho.',
		validationInvalidPhone: 'Pakilagay ang wastong numero ng telepono.',
		validationInvalidEmail: 'Pakilagay ang wastong email address.',
		validationMissingEndpoint: 'Hindi pa naka-configure ang quote form. Pakisubukang muli sa lalong madaling panahon.',
		validationFallbackError: 'Hindi namin maisumite ang quote request mo. Subukang muli o tumawag sa shop.',
		otherServiceLabel: 'Iba pa / Hindi pa sigurado',
	},
	id: {
		title: 'Ceritakan proyek Anda',
		description:
			'Ceritakan apa yang perlu diperbaiki atau dilapis ulang. Jika Anda sudah punya foto, sebutkan itu di pesan.',
		vehicleLabel: 'Detail kendaraan atau barang',
		namePlaceholder: 'Nama Anda',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nama@contoh.com',
		vehiclePlaceholder: 'mis. Camaro SS 1969, jok motor, atau kursi kapal',
		serviceLabel: 'Layanan yang dibutuhkan',
		servicePlaceholder: 'Pilih layanan',
		messageLabel: 'Ceritakan proyek Anda',
		messagePlaceholder:
			'Jelaskan apa yang perlu diperbaiki atau dilapis ulang, kondisinya saat ini, dan detail apa pun yang membantu untuk estimasi.',
		submitLabel: 'Kirim permintaan estimasi',
		submittingLabel: 'Mengirim...',
		successTitle: 'Terima kasih. Permintaan Anda sudah kami terima.',
		successBody: 'Setiap permintaan ditinjau secara manual dan kami akan segera menindaklanjuti.',
		errorTitle: 'Kami tidak dapat mengirim permintaan Anda.',
		validationInvalidInput: 'Silakan periksa formulir lalu coba lagi.',
		validationMissingContactMethod: 'Tambahkan nomor telepon, alamat email, atau keduanya.',
		validationInvalidPhone: 'Masukkan nomor telepon yang valid.',
		validationInvalidEmail: 'Masukkan alamat email yang valid.',
		validationMissingEndpoint: 'Formulir estimasi belum dikonfigurasi. Silakan coba lagi nanti.',
		validationFallbackError: 'Kami tidak dapat mengirim permintaan estimasi Anda. Coba lagi atau hubungi bengkel.',
		otherServiceLabel: 'Lainnya / Belum yakin',
	},
	fa: {
		title: 'درباره پروژه خود به ما بگویید',
		description: 'به ما بگویید چه چیزی به تعمیر یا روکش‌کاری نیاز دارد. اگر از قبل عکس دارید، آن را در پیام خود ذکر کنید.',
		vehicleLabel: 'جزئیات خودرو یا وسیله',
		namePlaceholder: 'نام شما',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'نام@نمونه.ir',
		vehiclePlaceholder: 'مثلاً کامارو SS مدل 1969، زین موتور یا صندلی قایق',
		serviceLabel: 'خدمت مورد نیاز',
		servicePlaceholder: 'یک خدمت را انتخاب کنید',
		messageLabel: 'درباره پروژه خود به ما بگویید',
		messagePlaceholder:
			'توضیح دهید چه چیزی به تعمیر یا روکش‌کاری نیاز دارد، وضعیت فعلی چگونه است و چه جزئیاتی برای برآورد مفید است.',
		submitLabel: 'ارسال درخواست برآورد',
		submittingLabel: 'در حال ارسال...',
		successTitle: 'ممنون. درخواست شما دریافت شد.',
		successBody: 'هر درخواست به‌صورت دستی بررسی می‌شود و به‌زودی با شما تماس می‌گیریم.',
		errorTitle: 'نتوانستیم درخواست شما را ارسال کنیم.',
		validationInvalidInput: 'لطفاً فرم را بررسی کرده و دوباره تلاش کنید.',
		validationMissingContactMethod: 'شماره تلفن، آدرس ایمیل یا هر دو را وارد کنید.',
		validationInvalidPhone: 'لطفاً یک شماره تلفن معتبر وارد کنید.',
		validationInvalidEmail: 'لطفاً یک آدرس ایمیل معتبر وارد کنید.',
		validationMissingEndpoint: 'فرم برآورد هنوز پیکربندی نشده است. لطفاً بعداً دوباره تلاش کنید.',
		validationFallbackError: 'نتوانستیم درخواست برآورد شما را ارسال کنیم. دوباره تلاش کنید یا با کارگاه تماس بگیرید.',
		otherServiceLabel: 'سایر / هنوز مطمئن نیستم',
	},
	te: {
		title: 'మీ ప్రాజెక్ట్ గురించి చెప్పండి',
		description: 'ఏం మరమ్మత్తు లేదా అప్హోల్స్టరీ పని కావాలో చెప్పండి. ఇప్పటికే ఫోటోలు ఉంటే, మీ సందేశంలో చెప్పండి.',
		vehicleLabel: 'వాహనం లేదా వస్తువు వివరాలు',
		namePlaceholder: 'మీ పేరు',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'పేరు@ఉదాహరణ.in',
		vehiclePlaceholder: 'ఉదా: 1969 Camaro SS, మోటార్‌సైకిల్ సీటు లేదా బోట్ సీటు',
		serviceLabel: 'అవసరమైన సేవ',
		servicePlaceholder: 'ఒక సేవను ఎంచుకోండి',
		messageLabel: 'మీ ప్రాజెక్ట్ గురించి చెప్పండి',
		messagePlaceholder:
			'ఏం మరమ్మత్తు లేదా అప్హోల్స్టరీ పని కావాలో, ప్రస్తుత పరిస్థితి ఏమిటో, కోట్‌కు ఉపయోగపడే ఇతర వివరాలను వివరించండి.',
		submitLabel: 'కోట్ అభ్యర్థనను పంపండి',
		submittingLabel: 'పంపిస్తోంది...',
		successTitle: 'ధన్యవాదాలు. మీ అభ్యర్థన మాకు అందింది.',
		successBody: 'ప్రతి అభ్యర్థనను మాన్యువల్‌గా పరిశీలించి మేము త్వరలో మిమ్మల్ని సంప్రదిస్తాము.',
		errorTitle: 'మీ అభ్యర్థనను పంపలేకపోయాము.',
		validationInvalidInput: 'దయచేసి ఫారమ్‌ను పరిశీలించి మళ్లీ ప్రయత్నించండి.',
		validationMissingContactMethod: 'ఫోన్ నంబర్, ఈమెయిల్ చిరునామా లేదా రెండింటినీ జోడించండి.',
		validationInvalidPhone: 'దయచేసి సరైన ఫోన్ నంబర్‌ను నమోదు చేయండి.',
		validationInvalidEmail: 'దయచేసి సరైన ఈమెయిల్ చిరునామాను నమోదు చేయండి.',
		validationMissingEndpoint: 'కోట్ ఫారం ఇంకా కాన్ఫిగర్ కాలేదు. దయచేసి కొద్దిసేపటికి మళ్లీ ప్రయత్నించండి.',
		validationFallbackError: 'మీ కోట్ అభ్యర్థనను పంపలేకపోయాము. దయచేసి మళ్లీ ప్రయత్నించండి లేదా షాప్‌కు కాల్ చేయండి.',
		otherServiceLabel: 'ఇతర / ఇంకా ఖచ్చితంగా తెలియదు',
	},
	fr: {
		title: 'Parlez-nous de votre projet',
		description:
			'Dites-nous ce qui a besoin d’une réparation ou d’un travail de garnissage. Si vous avez déjà des photos, mentionnez-le dans votre message.',
		vehicleLabel: 'Détails du véhicule ou de l’objet',
		namePlaceholder: 'Votre nom',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nom@exemple.fr',
		vehiclePlaceholder: 'ex. Camaro SS 1969, selle de moto ou siège de bateau',
		serviceLabel: 'Service demandé',
		servicePlaceholder: 'Sélectionnez un service',
		messageLabel: 'Parlez-nous de votre projet',
		messagePlaceholder:
			'Décrivez ce qui doit être réparé ou regarni, l’état actuel et tout détail utile pour établir un devis.',
		submitLabel: 'Envoyer la demande de devis',
		submittingLabel: 'Envoi en cours...',
		successTitle: 'Merci. Votre demande a bien été reçue.',
		successBody: 'Chaque demande est examinée manuellement et nous reviendrons vers vous rapidement.',
		errorTitle: 'Nous n’avons pas pu envoyer votre demande.',
		validationInvalidInput: 'Veuillez vérifier le formulaire et réessayer.',
		validationMissingContactMethod: 'Ajoutez un numéro de téléphone, une adresse email, ou les deux.',
		validationInvalidPhone: 'Veuillez saisir un numéro de téléphone valide.',
		validationInvalidEmail: 'Veuillez saisir une adresse email valide.',
		validationMissingEndpoint: 'Le formulaire de devis n’est pas encore configuré. Veuillez réessayer plus tard.',
		validationFallbackError: 'Nous n’avons pas pu envoyer votre demande de devis. Réessayez ou appelez l’atelier.',
		otherServiceLabel: 'Autre / Pas encore sûr',
	},
	ko: {
		title: '프로젝트에 대해 알려 주세요',
		description: '어떤 부분에 수리나 내장 작업이 필요한지 알려 주세요. 이미 사진이 있다면 메시지에 함께 적어 주세요.',
		vehicleLabel: '차량 또는 물품 정보',
		namePlaceholder: '이름',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: '이름@예시.kr',
		vehiclePlaceholder: '예: 1969 Camaro SS, 오토바이 시트 또는 보트 좌석',
		serviceLabel: '필요한 서비스',
		servicePlaceholder: '서비스를 선택하세요',
		messageLabel: '프로젝트에 대해 알려 주세요',
		messagePlaceholder:
			'어떤 부분에 수리나 내장 작업이 필요한지, 현재 상태가 어떤지, 견적에 도움이 되는 세부 정보를 적어 주세요.',
		submitLabel: '견적 요청 보내기',
		submittingLabel: '보내는 중...',
		successTitle: '감사합니다. 요청이 접수되었습니다.',
		successBody: '모든 요청은 수동으로 검토되며 곧 연락드리겠습니다.',
		errorTitle: '요청을 보낼 수 없습니다.',
		validationInvalidInput: '양식을 확인한 후 다시 시도해 주세요.',
		validationMissingContactMethod: '전화번호, 이메일 주소 또는 둘 다 입력해 주세요.',
		validationInvalidPhone: '유효한 전화번호를 입력해 주세요.',
		validationInvalidEmail: '유효한 이메일 주소를 입력해 주세요.',
		validationMissingEndpoint: '견적 양식이 아직 구성되지 않았습니다. 잠시 후 다시 시도해 주세요.',
		validationFallbackError: '견적 요청을 제출할 수 없습니다. 다시 시도하거나 매장으로 전화해 주세요.',
		otherServiceLabel: '기타 / 아직 잘 모르겠어요',
	},
	hi: {
		title: 'अपने प्रोजेक्ट के बारे में बताइए',
		description:
			'हमें बताइए किस चीज़ को मरम्मत या अपहोल्स्ट्री काम की ज़रूरत है। अगर आपके पास पहले से फोटो हैं, तो उसे अपने संदेश में लिखें।',
		vehicleLabel: 'वाहन या वस्तु का विवरण',
		namePlaceholder: 'आपका नाम',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'नाम@उदाहरण.in',
		vehiclePlaceholder: 'उदा. 1969 Camaro SS, मोटरसाइकिल सीट, या नाव की सीट',
		serviceLabel: 'आवश्यक सेवा',
		servicePlaceholder: 'एक सेवा चुनें',
		messageLabel: 'अपने प्रोजेक्ट के बारे में बताइए',
		messagePlaceholder:
			'क्या मरम्मत या अपहोल्स्ट्री काम चाहिए, उसकी वर्तमान स्थिति क्या है, और कोट के लिए कौन-सी जानकारी उपयोगी होगी, यह बताइए।',
		submitLabel: 'कोट अनुरोध भेजें',
		submittingLabel: 'भेजा जा रहा है...',
		successTitle: 'धन्यवाद। आपका अनुरोध हमें मिल गया है।',
		successBody: 'हर अनुरोध को मैन्युअल रूप से देखा जाता है और हम जल्द ही आपसे संपर्क करेंगे।',
		errorTitle: 'हम आपका अनुरोध भेज नहीं सके।',
		validationInvalidInput: 'कृपया फ़ॉर्म की जाँच करें और फिर से कोशिश करें।',
		validationMissingContactMethod: 'फ़ोन नंबर, ईमेल पता, या दोनों जोड़ें।',
		validationInvalidPhone: 'कृपया मान्य फ़ोन नंबर दर्ज करें।',
		validationInvalidEmail: 'कृपया मान्य ईमेल पता दर्ज करें।',
		validationMissingEndpoint: 'कोट फ़ॉर्म अभी कॉन्फ़िगर नहीं हुआ है। कृपया बाद में फिर कोशिश करें।',
		validationFallbackError: 'हम आपका कोट अनुरोध जमा नहीं कर सके। कृपया फिर कोशिश करें या दुकान पर कॉल करें।',
		otherServiceLabel: 'अन्य / अभी निश्चित नहीं',
	},
	pa: {
		title: 'ਆਪਣੇ ਪ੍ਰੋਜੈਕਟ ਬਾਰੇ ਦੱਸੋ',
		description:
			'ਸਾਨੂੰ ਦੱਸੋ ਕਿਸ ਚੀਜ਼ ਨੂੰ ਮੁਰੰਮਤ ਜਾਂ ਅਪਹੋਲਸਟਰੀ ਕੰਮ ਦੀ ਲੋੜ ਹੈ। ਜੇ ਤੁਹਾਡੇ ਕੋਲ ਪਹਿਲਾਂ ਹੀ ਫੋਟੋਆਂ ਹਨ, ਤਾਂ ਉਹ ਗੱਲ ਆਪਣੇ ਸੁਨੇਹੇ ਵਿੱਚ ਲਿਖੋ.',
		vehicleLabel: 'ਵਾਹਨ ਜਾਂ ਚੀਜ਼ ਦੇ ਵੇਰਵੇ',
		namePlaceholder: 'ਤੁਹਾਡਾ ਨਾਮ',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'ਨਾਮ@ਉਦਾਹਰਨ.in',
		vehiclePlaceholder: 'ਉਦਾਹਰਨ: 1969 Camaro SS, ਮੋਟਰਸਾਈਕਲ ਸੀਟ ਜਾਂ ਕਿਸ਼ਤੀ ਦੀ ਸੀਟ',
		serviceLabel: 'ਲੋੜੀਂਦੀ ਸੇਵਾ',
		servicePlaceholder: 'ਇੱਕ ਸੇਵਾ ਚੁਣੋ',
		messageLabel: 'ਆਪਣੇ ਪ੍ਰੋਜੈਕਟ ਬਾਰੇ ਦੱਸੋ',
		messagePlaceholder:
			'ਕੀ ਮੁਰੰਮਤ ਜਾਂ ਅਪਹੋਲਸਟਰੀ ਕੰਮ ਦੀ ਲੋੜ ਹੈ, ਮੌਜੂਦਾ ਹਾਲਤ ਕੀ ਹੈ, ਅਤੇ ਕੋਟ ਲਈ ਕਿਹੜੇ ਵੇਰਵੇ ਮਦਦਗਾਰ ਹਨ, ਇਹ ਦੱਸੋ.',
		submitLabel: 'ਕੋਟ ਬੇਨਤੀ ਭੇਜੋ',
		submittingLabel: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ...',
		successTitle: 'ਧੰਨਵਾਦ। ਤੁਹਾਡੀ ਬੇਨਤੀ ਸਾਨੂੰ ਮਿਲ ਗਈ ਹੈ.',
		successBody: 'ਹਰ ਬੇਨਤੀ ਹੱਥੋਂ ਵੇਖੀ ਜਾਂਦੀ ਹੈ ਅਤੇ ਅਸੀਂ ਜਲਦੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਾਂਗੇ.',
		errorTitle: 'ਅਸੀਂ ਤੁਹਾਡੀ ਬੇਨਤੀ ਨਹੀਂ ਭੇਜ ਸਕੇ.',
		validationInvalidInput: 'ਕਿਰਪਾ ਕਰਕੇ ਫਾਰਮ ਦੀ ਜਾਂਚ ਕਰੋ ਅਤੇ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ.',
		validationMissingContactMethod: 'ਫੋਨ ਨੰਬਰ, ਈਮੇਲ ਪਤਾ, ਜਾਂ ਦੋਵੇਂ ਸ਼ਾਮਲ ਕਰੋ.',
		validationInvalidPhone: 'ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਠੀਕ ਫੋਨ ਨੰਬਰ ਭਰੋ.',
		validationInvalidEmail: 'ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਠੀਕ ਈਮੇਲ ਪਤਾ ਭਰੋ.',
		validationMissingEndpoint: 'ਕੋਟ ਫਾਰਮ ਹਾਲੇ ਸੰਰਚਿਤ ਨਹੀਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਕੁਝ ਸਮੇਂ ਬਾਅਦ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ.',
		validationFallbackError: 'ਅਸੀਂ ਤੁਹਾਡੀ ਕੋਟ ਬੇਨਤੀ ਜਮ੍ਹਾਂ ਨਹੀਂ ਕਰ ਸਕੇ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਜਾਂ ਸ਼ਾਪ ਨੂੰ ਕਾਲ ਕਰੋ.',
		otherServiceLabel: 'ਹੋਰ / ਹਾਲੇ ਪੱਕਾ ਨਹੀਂ',
	},
	'pt-br': {
		title: 'Conte sobre o seu projeto',
		description:
			'Conte para nós o que precisa de reparo ou de trabalho de estofamento. Se você já tiver fotos, mencione isso na mensagem.',
		vehicleLabel: 'Detalhes do veículo ou item',
		namePlaceholder: 'Seu nome',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'nome@exemplo.com.br',
		vehiclePlaceholder: 'ex.: Camaro SS 1969, banco de moto ou assento de barco',
		serviceLabel: 'Serviço necessário',
		servicePlaceholder: 'Selecione um serviço',
		messageLabel: 'Conte sobre o seu projeto',
		messagePlaceholder:
			'Descreva o que precisa de reparo ou de estofamento, a condição atual e qualquer detalhe útil para o orçamento.',
		submitLabel: 'Enviar solicitação de orçamento',
		submittingLabel: 'Enviando...',
		successTitle: 'Obrigado. Sua solicitação foi recebida.',
		successBody: 'Cada solicitação é revisada manualmente e entraremos em contato em breve.',
		errorTitle: 'Não conseguimos enviar sua solicitação.',
		validationInvalidInput: 'Revise o formulário e tente novamente.',
		validationMissingContactMethod: 'Adicione um número de telefone, um endereço de email ou ambos.',
		validationInvalidPhone: 'Digite um número de telefone válido.',
		validationInvalidEmail: 'Digite um endereço de email válido.',
		validationMissingEndpoint: 'O formulário de orçamento ainda não está configurado. Tente novamente em breve.',
		validationFallbackError: 'Não conseguimos enviar sua solicitação de orçamento. Tente novamente ou ligue para a oficina.',
		otherServiceLabel: 'Outro / Ainda não tenho certeza',
	},
	'zh-hant': {
		title: '告訴我們您的項目情況',
		description: '請告訴我們哪些部位需要維修或重新包覆。如果您已經有照片，也請在訊息中提到。',
		vehicleLabel: '車輛或物件詳情',
		namePlaceholder: '您的姓名',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: '姓名@範例.com',
		vehiclePlaceholder: '例如：1969 Camaro SS、摩托車座椅或船長椅',
		serviceLabel: '所需服務',
		servicePlaceholder: '請選擇服務',
		messageLabel: '請介紹一下您的項目',
		messagePlaceholder: '請描述需要維修或重新包覆的內容、目前狀況，以及任何有助於報價的細節。',
		submitLabel: '提交報價請求',
		submittingLabel: '提交中...',
		successTitle: '謝謝。我們已收到您的請求。',
		successBody: '每份請求都會由人工審核，我們會盡快跟進。',
		errorTitle: '我們無法送出您的請求。',
		validationInvalidInput: '請檢查表單後再試一次。',
		validationMissingContactMethod: '請填寫電話號碼、電子郵件，或兩者都填。',
		validationInvalidPhone: '請輸入有效的電話號碼。',
		validationInvalidEmail: '請輸入有效的電子郵件地址。',
		validationMissingEndpoint: '報價表單尚未設定。請稍後再試。',
		validationFallbackError: '我們無法提交您的報價請求。請重試或致電店家。',
		otherServiceLabel: '其他 / 還不確定',
	},
	ja: {
		title: 'ご依頼内容を教えてください',
		description:
			'どの部分に修理や張り替えが必要か教えてください。すでに写真がある場合は、メッセージでそのこともお知らせください。',
		vehicleLabel: '車両または品目の詳細',
		namePlaceholder: 'お名前',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'namae@example.jp',
		vehiclePlaceholder: '例: 1969年式 Camaro SS、バイクシート、ボートシート',
		serviceLabel: '必要なサービス',
		servicePlaceholder: 'サービスを選択してください',
		messageLabel: 'ご依頼内容を教えてください',
		messagePlaceholder:
			'どの部分に修理や張り替えが必要か、現在の状態、見積もりに役立つ詳細をお書きください。',
		submitLabel: '見積もり依頼を送信',
		submittingLabel: '送信中...',
		successTitle: 'ありがとうございます。ご依頼を受け取りました。',
		successBody: 'すべての依頼は手動で確認され、まもなくご連絡します。',
		errorTitle: '依頼を送信できませんでした。',
		validationInvalidInput: 'フォームを確認して、もう一度お試しください。',
		validationMissingContactMethod: '電話番号、メールアドレス、または両方を入力してください。',
		validationInvalidPhone: '有効な電話番号を入力してください。',
		validationInvalidEmail: '有効なメールアドレスを入力してください。',
		validationMissingEndpoint: '見積もりフォームはまだ設定されていません。後でもう一度お試しください。',
		validationFallbackError: '見積もり依頼を送信できませんでした。もう一度お試しいただくか、店舗までお電話ください。',
		otherServiceLabel: 'その他 / まだわからない',
	},
	ar: {
		title: 'أخبرنا عن مشروعك',
		description: 'أخبرنا بما يحتاج إلى إصلاح أو تنجيد. إذا كانت لديك صور بالفعل، فاذكر ذلك في رسالتك.',
		vehicleLabel: 'تفاصيل السيارة أو القطعة',
		namePlaceholder: 'اسمك',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'الاسم@مثال.com',
		vehiclePlaceholder: 'مثال: Camaro SS 1969 أو مقعد دراجة نارية أو مقعد قارب',
		serviceLabel: 'الخدمة المطلوبة',
		servicePlaceholder: 'اختر خدمة',
		messageLabel: 'أخبرنا عن مشروعك',
		messagePlaceholder:
			'اشرح ما الذي يحتاج إلى إصلاح أو تنجيد، وما حالته الحالية، وأي تفاصيل تفيد في إعداد عرض السعر.',
		submitLabel: 'إرسال طلب عرض السعر',
		submittingLabel: 'جارٍ الإرسال...',
		successTitle: 'شكرًا لك. لقد استلمنا طلبك.',
		successBody: 'تتم مراجعة كل طلب يدويًا وسنتابع معك قريبًا.',
		errorTitle: 'تعذر إرسال طلبك.',
		validationInvalidInput: 'يرجى مراجعة النموذج والمحاولة مرة أخرى.',
		validationMissingContactMethod: 'أضف رقم هاتف أو بريدًا إلكترونيًا أو كليهما.',
		validationInvalidPhone: 'يرجى إدخال رقم هاتف صالح.',
		validationInvalidEmail: 'يرجى إدخال عنوان بريد إلكتروني صالح.',
		validationMissingEndpoint: 'نموذج عرض السعر غير مُعد بعد. يرجى المحاولة مرة أخرى لاحقًا.',
		validationFallbackError: 'تعذر إرسال طلب عرض السعر. حاول مرة أخرى أو اتصل بالورشة.',
		otherServiceLabel: 'أخرى / لست متأكدًا بعد',
	},
	ru: {
		title: 'Расскажите о вашем проекте',
		description: 'Расскажите, что нужно отремонтировать или перетянуть. Если у вас уже есть фото, укажите это в сообщении.',
		vehicleLabel: 'Данные автомобиля или предмета',
		namePlaceholder: 'Ваше имя',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'имя@пример.ru',
		vehiclePlaceholder: 'например: Camaro SS 1969 года, сиденье мотоцикла или кресло катера',
		serviceLabel: 'Нужная услуга',
		servicePlaceholder: 'Выберите услугу',
		messageLabel: 'Расскажите о вашем проекте',
		messagePlaceholder:
			'Опишите, что нужно отремонтировать или перетянуть, текущее состояние и любые детали, полезные для оценки.',
		submitLabel: 'Отправить запрос на оценку',
		submittingLabel: 'Отправка...',
		successTitle: 'Спасибо. Мы получили ваш запрос.',
		successBody: 'Каждый запрос проверяется вручную, и мы скоро свяжемся с вами.',
		errorTitle: 'Мы не смогли отправить ваш запрос.',
		validationInvalidInput: 'Проверьте форму и попробуйте снова.',
		validationMissingContactMethod: 'Добавьте номер телефона, email или оба варианта.',
		validationInvalidPhone: 'Введите корректный номер телефона.',
		validationInvalidEmail: 'Введите корректный адрес email.',
		validationMissingEndpoint: 'Форма оценки еще не настроена. Попробуйте позже.',
		validationFallbackError: 'Мы не смогли отправить ваш запрос на оценку. Попробуйте снова или позвоните в мастерскую.',
		otherServiceLabel: 'Другое / Пока не уверен',
	},
	ta: {
		title: 'உங்கள் திட்டத்தைப் பற்றி சொல்லுங்கள்',
		description:
			'எதற்கு பழுது சரி செய்யும் வேலை அல்லது அப்ஹோல்ஸ்ட்ரி வேலை தேவை என்று சொல்லுங்கள். ஏற்கனவே புகைப்படங்கள் இருந்தால், அதை உங்கள் செய்தியில் குறிப்பிடுங்கள்.',
		vehicleLabel: 'வாகனம் அல்லது பொருளின் விவரங்கள்',
		namePlaceholder: 'உங்கள் பெயர்',
		phonePlaceholder: '(408) 555-1234',
		emailPlaceholder: 'பெயர்@உதாரணம்.in',
		vehiclePlaceholder: 'உதா: 1969 Camaro SS, மோட்டார் சைக்கிள் சீட், அல்லது படகு இருக்கை',
		serviceLabel: 'தேவையான சேவை',
		servicePlaceholder: 'ஒரு சேவையைத் தேர்ந்தெடுக்கவும்',
		messageLabel: 'உங்கள் திட்டத்தைப் பற்றி சொல்லுங்கள்',
		messagePlaceholder:
			'எது பழுது சரி செய்யப்பட வேண்டும் அல்லது அப்ஹோல்ஸ்ட்ரி செய்யப்பட வேண்டும், தற்போதைய நிலை என்ன, மதிப்பீட்டுக்கு உதவும் விவரங்கள் என்ன என்பதைக் குறிப்பிடுங்கள்.',
		submitLabel: 'மதிப்பீட்டு கோரிக்கையை அனுப்புங்கள்',
		submittingLabel: 'அனுப்பப்படுகிறது...',
		successTitle: 'நன்றி. உங்கள் கோரிக்கை எங்களுக்கு வந்துள்ளது.',
		successBody: 'ஒவ்வொரு கோரிக்கையும் கைமுறையாக பரிசீலிக்கப்படுகிறது; விரைவில் உங்களைத் தொடர்புகொள்வோம்.',
		errorTitle: 'உங்கள் கோரிக்கையை அனுப்ப முடியவில்லை.',
		validationInvalidInput: 'படிவத்தைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
		validationMissingContactMethod: 'தொலைபேசி எண், மின்னஞ்சல் முகவரி, அல்லது இரண்டையும் சேர்க்கவும்.',
		validationInvalidPhone: 'செல்லுபடியாகும் தொலைபேசி எண்ணை உள்ளிடவும்.',
		validationInvalidEmail: 'செல்லுபடியாகும் மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
		validationMissingEndpoint: 'மதிப்பீட்டு படிவம் இன்னும் கட்டமைக்கப்படவில்லை. பின்னர் மீண்டும் முயற்சிக்கவும்.',
		validationFallbackError: 'உங்கள் மதிப்பீட்டு கோரிக்கையை அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது கடைக்கு அழைக்கவும்.',
		otherServiceLabel: 'மற்றவை / இன்னும் உறுதியாக தெரியவில்லை',
	},
};

const SERVICE_OPTION_KEYS = [
	{ value: 'auto-upholstery', pageKey: 'autoUpholstery' },
	{ value: 'car-seats', pageKey: 'carSeats' },
	{ value: 'headliners', pageKey: 'headliners' },
	{ value: 'convertible-tops', pageKey: 'convertibleTops' },
	{ value: 'classic-cars', pageKey: 'classicCars' },
	{ value: 'commercial-fleet', pageKey: 'commercialFleet' },
	{ value: 'motorcycle-seats', pageKey: 'motorcycleSeats' },
] as const;

function resolveLocaleKey(locale: LocaleKey): LocaleKey {
	return (LOCALES[locale] ? locale : 'en') as LocaleKey;
}

function getPageLabel(pageKey: string, locale: LocaleKey): string | null {
	const labelsByLocale = PAGE_LABELS as Record<string, Record<string, string>>;
	return labelsByLocale[locale]?.[pageKey] ?? null;
}

export function getQuoteFormCopy(locale: LocaleKey): QuoteFormCopy {
	const resolvedLocale = resolveLocaleKey(locale) as LocaleKey;
	const chatCopy = CHAT_COPY[resolvedLocale] ?? CHAT_COPY.en;
	const localeCopy = QUOTE_FORM_COPY[resolvedLocale];

	const serviceOptions: Array<{ value: string; label: string }> = SERVICE_OPTION_KEYS.map(({ value, pageKey }) => ({
		value,
		label: getPageLabel(pageKey, resolvedLocale) ?? getPageLabel(pageKey, 'en') ?? value,
	}));

	serviceOptions.push({
		value: 'other',
		label: localeCopy.otherServiceLabel,
	});

	return {
		kicker: chatCopy.quoteCta,
		title: localeCopy.title,
		description: localeCopy.description,
		nameLabel: chatCopy.nameLabel,
		namePlaceholder: localeCopy.namePlaceholder,
		phoneLabel: chatCopy.phoneLabel,
		phonePlaceholder: localeCopy.phonePlaceholder,
		emailLabel: chatCopy.emailLabel,
		emailPlaceholder: localeCopy.emailPlaceholder,
		vehicleLabel: localeCopy.vehicleLabel,
		vehiclePlaceholder: localeCopy.vehiclePlaceholder,
		serviceLabel: localeCopy.serviceLabel,
		servicePlaceholder: localeCopy.servicePlaceholder,
		messageLabel: localeCopy.messageLabel,
		messagePlaceholder: localeCopy.messagePlaceholder,
		submitLabel: localeCopy.submitLabel,
		submittingLabel: localeCopy.submittingLabel,
		successTitle: localeCopy.successTitle,
		successBody: localeCopy.successBody,
		errorTitle: localeCopy.errorTitle,
		errorBody: localeCopy.validationFallbackError,
		validationInvalidInput: localeCopy.validationInvalidInput,
		validationMissingContactMethod: localeCopy.validationMissingContactMethod,
		validationInvalidPhone: localeCopy.validationInvalidPhone,
		validationInvalidEmail: localeCopy.validationInvalidEmail,
		validationMissingEndpoint: localeCopy.validationMissingEndpoint,
		validationFallbackError: localeCopy.validationFallbackError,
		serviceOptions,
	};
}
