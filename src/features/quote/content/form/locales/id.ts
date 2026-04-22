import type { QuoteFormLocaleCopy } from '../types';

export const quoteFormCopyId = {
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
  validationFallbackError:
    'Kami tidak dapat mengirim permintaan estimasi Anda. Coba lagi atau hubungi bengkel.',
  otherServiceLabel: 'Lainnya / Belum yakin',
  photosLabel: 'Foto',
  photosHelper: 'Opsional. Tambahkan beberapa foto yang jelas jika ada.',
  addPhotosLabel: 'Tambah foto',
  removePhotoLabel: 'Hapus foto',
} satisfies QuoteFormLocaleCopy;
