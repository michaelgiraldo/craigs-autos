import type { LocaleKey } from '../../../../types/site';
import type { QuotePhotoDraft, QuoteRequestFormData } from './types';

export type UploadedQuotePhotoAttachment = {
  attachment_id: string;
  byte_size: number;
  content_type: string;
  filename: string;
  key: string;
};

type PostQuoteRequestArgs = {
  endpoint: string;
  form: QuoteRequestFormData;
  attachments?: UploadedQuotePhotoAttachment[];
  attribution: unknown;
  clientEventId: string;
  journeyId: string | null;
  locale: LocaleKey;
  pageUrl: string;
  unsupportedAttachmentCount?: number;
  userId: string | null;
};

type UploadTarget = UploadedQuotePhotoAttachment & {
  client_file_id: string;
  upload: {
    fields: Record<string, string>;
    url: string;
  };
};

type UploadTargetResponse = {
  attachments?: UploadTarget[];
  unsupported_count?: number;
};

export type UploadQuotePhotosResult = {
  attachments: UploadedQuotePhotoAttachment[];
  unsupportedAttachmentCount: number;
};

export async function postQuoteRequest({
  endpoint,
  form,
  attachments = [],
  attribution,
  clientEventId,
  journeyId,
  locale,
  pageUrl,
  unsupportedAttachmentCount = 0,
  userId,
}: PostQuoteRequestArgs): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...form,
      attachments,
      attribution,
      client_event_id: clientEventId,
      journey_id: journeyId,
      locale,
      pageUrl,
      service: form.service,
      unsupported_attachment_count: unsupportedAttachmentCount,
      user: userId,
    }),
  });

  const responseText = await response.text();
  let responseData: Record<string, unknown> = {};
  try {
    responseData = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    responseData = {};
  }

  if (!response.ok) {
    const serverMessage =
      typeof responseData.error === 'string' && responseData.error.trim()
        ? responseData.error.trim()
        : '';
    const submitError = new Error(serverMessage || `Request failed with status ${response.status}`);
    submitError.name = `http_${response.status}`;
    throw submitError;
  }

  return responseData;
}

async function uploadPhotoToS3(target: UploadTarget, photo: QuotePhotoDraft): Promise<boolean> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(target.upload.fields)) {
    formData.append(key, value);
  }
  formData.append('file', photo.file, target.filename);

  try {
    const response = await fetch(target.upload.url, {
      method: 'POST',
      body: formData,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function uploadQuotePhotos(args: {
  clientEventId: string;
  endpoint: string | null;
  photos: QuotePhotoDraft[];
  unsupportedPhotoCount: number;
}): Promise<UploadQuotePhotosResult> {
  if (!args.photos.length) {
    return {
      attachments: [],
      unsupportedAttachmentCount: args.unsupportedPhotoCount,
    };
  }

  if (!args.endpoint) {
    return {
      attachments: [],
      unsupportedAttachmentCount: args.unsupportedPhotoCount + args.photos.length,
    };
  }

  let responseData: UploadTargetResponse = {};
  try {
    const response = await fetch(args.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_event_id: args.clientEventId,
        files: args.photos.map((photo) => ({
          byte_size: photo.size,
          client_file_id: photo.id,
          content_type: photo.type,
          name: photo.name,
        })),
      }),
    });
    if (!response.ok) {
      return {
        attachments: [],
        unsupportedAttachmentCount: args.unsupportedPhotoCount + args.photos.length,
      };
    }
    responseData = (await response.json()) as UploadTargetResponse;
  } catch {
    return {
      attachments: [],
      unsupportedAttachmentCount: args.unsupportedPhotoCount + args.photos.length,
    };
  }

  const targets = Array.isArray(responseData.attachments) ? responseData.attachments : [];
  let unsupportedAttachmentCount =
    args.unsupportedPhotoCount +
    (typeof responseData.unsupported_count === 'number' ? responseData.unsupported_count : 0);
  const attachments: UploadedQuotePhotoAttachment[] = [];

  for (const target of targets) {
    const photo = args.photos.find((candidate) => candidate.id === target.client_file_id);
    if (!photo) {
      unsupportedAttachmentCount += 1;
      continue;
    }

    const uploaded = await uploadPhotoToS3(target, photo);
    if (!uploaded) {
      unsupportedAttachmentCount += 1;
      continue;
    }

    attachments.push({
      attachment_id: target.attachment_id,
      byte_size: target.byte_size,
      content_type: target.content_type,
      filename: target.filename,
      key: target.key,
    });
  }

  return {
    attachments,
    unsupportedAttachmentCount,
  };
}
