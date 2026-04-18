export type LambdaEvent = {
  headers?: Record<string, string | string[] | undefined> | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  rawPath?: string | null;
  rawQueryString?: string | null;
  isBase64Encoded?: boolean;
};

export type LambdaResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};

export type AttachmentUploadConfig = {
  bucketName?: string;
  maxBytes: number;
  allowedMimeTypes: Set<string>;
};

export type ParsedUpload = {
  file?: File;
  threadId: string | null;
};

export type StoredAttachment = {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
};

export type DownloadedAttachment = {
  bytes: Buffer;
  contentType: string;
  filename: string;
};
