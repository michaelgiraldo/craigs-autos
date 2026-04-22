import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  LEAD_PHOTO_LIMITS,
  classifyLeadPhotoCandidates,
  sanitizeLeadAttachmentFilename,
  sanitizeLeadAttachmentPathSegment,
  type LeadPhotoContentType,
} from '../_lead-platform/domain/lead-attachment.ts';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';
import { createLeadAttachmentUploadStartRuntime } from './runtime.ts';

export type LeadAttachmentUploadStartEvent = {
  headers?: Record<string, string | undefined> | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type LeadAttachmentUploadTarget = {
  attachment_id: string;
  byte_size: number;
  client_file_id: string;
  content_type: LeadPhotoContentType;
  filename: string;
  key: string;
  upload: {
    fields: Record<string, string>;
    url: string;
  };
};

export type LeadAttachmentUploadStartDeps = {
  configValid: boolean;
  createUploadTarget: (args: {
    attachmentId: string;
    byteSize: number;
    clientEventId: string;
    contentType: LeadPhotoContentType;
    filename: string;
    key: string;
  }) => Promise<{ fields: Record<string, string>; url: string }>;
};

const payloadSchema = z.object({
  client_event_id: z.string().trim().min(1).max(200),
  files: z
    .array(
      z.object({
        byte_size: z
          .number()
          .int()
          .min(0)
          .max(100 * 1024 * 1024),
        client_file_id: z.string().trim().min(1).max(200),
        content_type: z.string().trim().max(120),
        name: z.string().trim().max(240).optional(),
      }),
    )
    .max(20),
});

function parsePayload(event: LeadAttachmentUploadStartEvent): z.infer<typeof payloadSchema> | null {
  try {
    const rawBody = decodeBody(event);
    const parsedJson = rawBody ? JSON.parse(rawBody) : {};
    const result = payloadSchema.safeParse(parsedJson);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function createLeadAttachmentUploadStartHandler(deps: LeadAttachmentUploadStartDeps) {
  return async (event: LeadAttachmentUploadStartEvent) => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      return emptyResponse(204);
    }

    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!deps.configValid) {
      console.error('Lead attachment upload start is missing required configuration.');
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    const payload = parsePayload(event);
    if (!payload) {
      return jsonResponse(400, { error: 'Invalid request payload' });
    }

    const clientEventId = payload.client_event_id.trim();
    const clientEventKeySegment = sanitizeLeadAttachmentPathSegment(clientEventId);
    const classified = classifyLeadPhotoCandidates(
      payload.files.map((file) => ({
        contentType: file.content_type,
        filename: file.name,
        id: file.client_file_id,
        item: file,
        size: file.byte_size,
      })),
    );

    const attachments: LeadAttachmentUploadTarget[] = [];
    for (const candidate of classified.accepted) {
      const attachmentId = randomUUID();
      const filename = sanitizeLeadAttachmentFilename(
        candidate.filename,
        candidate.contentType,
        `photo-${attachments.length + 1}`,
      );
      const key = `form/${clientEventKeySegment}/${attachmentId}/${filename}`;
      const upload = await deps.createUploadTarget({
        attachmentId,
        byteSize: candidate.size,
        clientEventId,
        contentType: candidate.contentType,
        filename,
        key,
      });

      attachments.push({
        attachment_id: attachmentId,
        byte_size: candidate.size,
        client_file_id: candidate.item.client_file_id,
        content_type: candidate.contentType,
        filename,
        key,
        upload,
      });
    }

    return jsonResponse(200, {
      ok: true,
      attachments,
      limits: {
        max_count: LEAD_PHOTO_LIMITS.maxCount,
        max_bytes_per_photo: LEAD_PHOTO_LIMITS.maxBytesPerPhoto,
        max_total_bytes: LEAD_PHOTO_LIMITS.maxTotalBytes,
      },
      unsupported_count: classified.unsupportedCount,
    });
  };
}

export const handler = createLeadAttachmentUploadStartHandler(
  createLeadAttachmentUploadStartRuntime(),
);
