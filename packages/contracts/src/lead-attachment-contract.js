export const LEAD_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const LEAD_PHOTO_ACCEPT_EXTENSIONS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export const LEAD_PHOTO_LIMITS = {
  maxCount: 4,
  maxBytesPerPhoto: 5 * 1024 * 1024,
  maxTotalBytes: 12 * 1024 * 1024,
};
