import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyKo = {
  title: '프로젝트에 대해 알려 주세요',
  description:
    '어떤 부분에 수리나 내장 작업이 필요한지 알려 주세요. 이미 사진이 있다면 메시지에 함께 적어 주세요.',
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
  validationFallbackError:
    '견적 요청을 제출할 수 없습니다. 다시 시도하거나 매장으로 전화해 주세요.',
  otherServiceLabel: '기타 / 아직 잘 모르겠어요',
} satisfies QuoteFormLocaleCopy;
