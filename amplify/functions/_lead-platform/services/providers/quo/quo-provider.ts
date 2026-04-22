import { SMS_CONTENT_MAX_LENGTH, validateSmsContent } from '../sms-policy.ts';
import type {
  DestinationSyncProvider,
  ProviderReadiness,
  ProviderReadinessIssue,
  SmsMessagingProvider,
} from '../provider-contracts.ts';
import { sendQuoTextMessage } from './quo-client.ts';
import { isQuoPhoneNumberId, isQuoUserId } from './quo-identifiers.ts';

export type QuoProviderConfig = {
  apiKey: string;
  enabled: boolean;
  fromPhoneNumberId: string;
  userId: string | null;
  contactSource: string | null;
  contactExternalIdPrefix: string | null;
  leadTagsFieldKey: string | null;
  leadTagsFieldName: string | null;
};

function readinessMessage(args: {
  label: string;
  enabled: boolean;
  issues: ProviderReadinessIssue[];
}): string {
  if (!args.enabled) return `${args.label} is disabled.`;
  if (!args.issues.length) return `${args.label} is ready.`;
  return `${args.label} is not ready: ${args.issues.map((issue) => issue.message).join('; ')}.`;
}

function buildReadiness(args: {
  capability: ProviderReadiness['capability'];
  enabled: boolean;
  issues: ProviderReadinessIssue[];
  label: string;
}): ProviderReadiness {
  const issues = args.enabled
    ? args.issues
    : [
        {
          code: 'provider_disabled' as const,
          message: 'provider is disabled',
        },
        ...args.issues,
      ];

  return {
    provider: 'quo',
    capability: args.capability,
    enabled: args.enabled,
    ready: args.enabled && issues.length === 0,
    issues,
    message: readinessMessage({ label: args.label, enabled: args.enabled, issues }),
  };
}

function messagingIssues(config: QuoProviderConfig): ProviderReadinessIssue[] {
  const issues: ProviderReadinessIssue[] = [];
  const apiKey = config.apiKey.trim();
  const fromPhoneNumberId = config.fromPhoneNumberId.trim();
  const userId = config.userId?.trim() ?? '';

  if (!apiKey) {
    issues.push({ code: 'missing_api_key', message: 'QUO API key is missing' });
  }
  if (!fromPhoneNumberId) {
    issues.push({ code: 'missing_sender_id', message: 'QUO sender phone number id is missing' });
  } else if (!isQuoPhoneNumberId(fromPhoneNumberId)) {
    issues.push({
      code: 'invalid_sender_id',
      message: 'QUO sender phone number id must start with PN',
    });
  }
  if (userId && !isQuoUserId(userId)) {
    issues.push({ code: 'invalid_user_id', message: 'QUO user id must start with US' });
  }

  return issues;
}

function destinationSyncIssues(config: QuoProviderConfig): ProviderReadinessIssue[] {
  const issues = messagingIssues(config);
  if (!config.contactSource?.trim()) {
    issues.push({ code: 'missing_contact_source', message: 'QUO contact source is missing' });
  }
  if (!config.contactExternalIdPrefix?.trim()) {
    issues.push({
      code: 'missing_external_id_prefix',
      message: 'QUO contact external id prefix is missing',
    });
  }
  if (!config.leadTagsFieldKey?.trim() && !config.leadTagsFieldName?.trim()) {
    issues.push({
      code: 'missing_lead_tags_config',
      message: 'QUO lead tags field key or field name is missing',
    });
  }
  return issues;
}

export function getQuoMessagingReadiness(config: QuoProviderConfig): ProviderReadiness {
  return buildReadiness({
    capability: 'sms_delivery',
    enabled: config.enabled,
    issues: messagingIssues(config),
    label: 'QUO SMS provider',
  });
}

export function getQuoDestinationSyncReadiness(config: QuoProviderConfig): ProviderReadiness {
  return buildReadiness({
    capability: 'destination_sync',
    enabled: config.enabled,
    issues: destinationSyncIssues(config),
    label: 'QUO destination sync provider',
  });
}

export function createQuoMessagingProvider(config: QuoProviderConfig): SmsMessagingProvider {
  const readiness = getQuoMessagingReadiness(config);

  return {
    provider: 'quo',
    capability: 'sms_delivery',
    readiness,
    async sendText({ toE164, body }) {
      if (!readiness.ready) {
        throw new Error(readiness.message);
      }

      const content = validateSmsContent(body);
      if (!content.ok) {
        throw new Error(content.message);
      }

      return sendQuoTextMessage({
        apiKey: config.apiKey,
        fromPhoneNumberId: config.fromPhoneNumberId,
        toE164,
        content: content.content,
        userId: config.userId,
      });
    },
  };
}

export function createQuoDestinationSyncProvider(
  config: QuoProviderConfig,
): DestinationSyncProvider {
  return {
    provider: 'quo',
    capability: 'destination_sync',
    readiness: getQuoDestinationSyncReadiness(config),
  };
}

export function describeQuoSmsPolicy(): string {
  return `QUO SMS delivery requires E.164 recipients and ${SMS_CONTENT_MAX_LENGTH} characters or fewer.`;
}
