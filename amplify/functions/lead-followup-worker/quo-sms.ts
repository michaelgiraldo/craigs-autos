import { sendQuoTextMessage } from '../_shared/quo-client.ts';
import type { LeadFollowupWorkerDeps } from './types.ts';

export function createQuoSmsSender(args: {
  apiKey: string;
  enabled: boolean;
  fromPhoneNumberId: string;
  userId: string | null;
}): LeadFollowupWorkerDeps['sendSms'] {
  return async ({ toE164, body }) => {
    if (!args.enabled) {
      throw new Error('QUO is not enabled');
    }
    if (!args.apiKey || !args.fromPhoneNumberId) {
      throw new Error('QUO is not configured');
    }

    return sendQuoTextMessage({
      apiKey: args.apiKey,
      fromPhoneNumberId: args.fromPhoneNumberId,
      toE164,
      content: body,
      userId: args.userId,
    });
  };
}
