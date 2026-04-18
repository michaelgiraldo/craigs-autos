import { getErrorDetails } from '../_shared/safe.ts';
import { AttachmentUploadError } from './policy.ts';
import { buildPreviewBaseUrl, getMethod, getQueryParam, parseUploadedFile } from './request.ts';
import { binary, json, uploadSuccess } from './response.ts';
import { fetchAttachmentForDownload, putAttachment } from './storage.ts';
import type { LambdaEvent, LambdaResponse } from './types.ts';
import { readAttachmentUploadConfig } from './upload-config.ts';

const attachmentConfig = readAttachmentUploadConfig();

function attachmentErrorResponse(error: AttachmentUploadError): LambdaResponse {
  switch (error.code) {
    case 'attachment_too_large':
      return json(413, { error: 'Attachment exceeds allowed size.' });
    case 'invalid_attachment_id':
      return json(400, { error: 'Invalid attachment id.' });
    case 'missing_attachment_id':
      return json(400, { error: 'Missing attachment id.' });
    case 'storage_not_configured':
      return json(500, { error: 'Attachment storage is not configured.' });
    case 'unsupported_mime_type':
      return json(415, { error: 'Unsupported attachment format.' });
  }
}

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  try {
    const method = getMethod(event);

    if (method === 'GET') {
      const attachmentId = getQueryParam(event, 'id') ?? '';
      const attachment = await fetchAttachmentForDownload(attachmentId, attachmentConfig);
      return binary(attachment.bytes, attachment.contentType, attachment.filename);
    }

    if (method !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const { file, threadId } = await parseUploadedFile(event);
    if (!file) {
      return json(400, { error: 'No file uploaded. Include a multipart file field named "file".' });
    }

    const uploaded = await putAttachment({
      config: attachmentConfig,
      file,
      previewBaseUrl: buildPreviewBaseUrl(event),
      threadId,
    });

    return uploadSuccess(uploaded);
  } catch (err: unknown) {
    if (err instanceof AttachmentUploadError) {
      return attachmentErrorResponse(err);
    }

    const { message, name } = getErrorDetails(err);
    console.error('Attachment upload failed', name, message);
    return json(500, { error: 'Attachment upload failed.' });
  }
};
