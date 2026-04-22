import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyVi = {
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
  photosLabel: 'Ảnh',
  photosHelper: 'Không bắt buộc. Thêm vài ảnh rõ nếu bạn có.',
  addPhotosLabel: 'Thêm ảnh',
  removePhotoLabel: 'Xóa ảnh',
} satisfies QuoteFormLocaleCopy;
