export declare const LEAD_PHOTO_CONTENT_TYPES: readonly ['image/jpeg', 'image/png', 'image/webp'];

export type LeadPhotoContentType = (typeof LEAD_PHOTO_CONTENT_TYPES)[number];

export declare const LEAD_PHOTO_ACCEPT_EXTENSIONS: {
  readonly 'image/jpeg': readonly ['.jpg', '.jpeg'];
  readonly 'image/png': readonly ['.png'];
  readonly 'image/webp': readonly ['.webp'];
};

export declare const LEAD_PHOTO_LIMITS: {
  readonly maxCount: 4;
  readonly maxBytesPerPhoto: number;
  readonly maxTotalBytes: number;
};
