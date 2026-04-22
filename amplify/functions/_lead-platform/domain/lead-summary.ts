import type { CaptureChannel } from './lead-actions.ts';
import { normalizeStringList, trimToNull } from './normalize.ts';

export type CustomerResponsePolicy = 'automatic' | 'manual_review';
export type LeadTriageDecision = 'accept' | 'review' | 'reject';

export type LeadSummary = {
  capture_channel: CaptureChannel;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_language: string | null;
  vehicle: string | null;
  service: string | null;
  project_summary: string;
  customer_message: string | null;
  known_facts: string[];
  missing_info: string[];
  recommended_next_steps: string[];
  already_asked_questions: string[];
  photo_reference_count: number;
  loaded_photo_count: number;
  unsupported_attachment_count: number;
  customer_response_policy: CustomerResponsePolicy;
  customer_response_policy_reason: string;
};

export type LeadSummaryInput = {
  captureChannel: CaptureChannel;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerLanguage?: string | null;
  vehicle?: string | null;
  service?: string | null;
  projectSummary?: string | null;
  customerMessage?: string | null;
  knownFacts?: unknown;
  missingInfo?: unknown;
  recommendedNextSteps?: unknown;
  alreadyAskedQuestions?: unknown;
  photoReferenceCount?: number | null;
  loadedPhotoCount?: number | null;
  unsupportedAttachmentCount?: number | null;
  customerResponsePolicy?: CustomerResponsePolicy | null;
  customerResponsePolicyReason?: string | null;
};

function normalizeCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

function requiredSummaryText(input: LeadSummaryInput): string {
  return (
    trimToNull(input.projectSummary, 4_000) ??
    trimToNull(input.customerMessage, 4_000) ??
    `${input.captureChannel} lead captured for follow-up.`
  );
}

export function createLeadSummary(input: LeadSummaryInput): LeadSummary {
  const projectSummary = requiredSummaryText(input);
  const customerMessage = trimToNull(input.customerMessage, 4_000);
  const policy = input.customerResponsePolicy ?? 'automatic';

  return {
    capture_channel: input.captureChannel,
    customer_name: trimToNull(input.customerName, 200),
    customer_email: trimToNull(input.customerEmail, 320),
    customer_phone: trimToNull(input.customerPhone, 64),
    customer_language: trimToNull(input.customerLanguage, 64),
    vehicle: trimToNull(input.vehicle, 160),
    service: trimToNull(input.service, 160),
    project_summary: projectSummary,
    customer_message: customerMessage,
    known_facts: normalizeStringList(input.knownFacts, 240).slice(0, 12),
    missing_info: normalizeStringList(input.missingInfo, 160).slice(0, 8),
    recommended_next_steps: normalizeStringList(input.recommendedNextSteps, 240).slice(0, 8),
    already_asked_questions: normalizeStringList(input.alreadyAskedQuestions, 240).slice(0, 8),
    photo_reference_count: normalizeCount(input.photoReferenceCount),
    loaded_photo_count: normalizeCount(input.loadedPhotoCount),
    unsupported_attachment_count: normalizeCount(input.unsupportedAttachmentCount),
    customer_response_policy: policy,
    customer_response_policy_reason:
      trimToNull(input.customerResponsePolicyReason, 240) ??
      (policy === 'manual_review' ? 'manual_review_required' : 'automatic_response_allowed'),
  };
}

export function createFallbackLeadSummary(input: {
  captureChannel: CaptureChannel;
  customerLanguage?: string | null;
  customerMessage?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  vehicle?: string | null;
  service?: string | null;
  missingInfo?: unknown;
  photoReferenceCount?: number | null;
  loadedPhotoCount?: number | null;
  unsupportedAttachmentCount?: number | null;
  customerResponsePolicy?: CustomerResponsePolicy | null;
  customerResponsePolicyReason?: string | null;
}): LeadSummary {
  return createLeadSummary({
    captureChannel: input.captureChannel,
    customerLanguage: input.customerLanguage,
    customerMessage: input.customerMessage,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    vehicle: input.vehicle,
    service: input.service,
    projectSummary: input.customerMessage,
    knownFacts: [],
    missingInfo: input.missingInfo,
    recommendedNextSteps:
      input.customerResponsePolicy === 'manual_review'
        ? ['Review the captured lead and follow up manually.']
        : ['Follow up with the customer.'],
    alreadyAskedQuestions: [],
    photoReferenceCount: input.photoReferenceCount,
    loadedPhotoCount: input.loadedPhotoCount,
    unsupportedAttachmentCount: input.unsupportedAttachmentCount,
    customerResponsePolicy: input.customerResponsePolicy,
    customerResponsePolicyReason: input.customerResponsePolicyReason,
  });
}
