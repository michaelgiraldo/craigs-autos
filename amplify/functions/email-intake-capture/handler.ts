import { getErrorDetails } from '../_shared/safe.ts';
import { processEmailIntakeEvent } from './process-email-intake.ts';
import { createEmailIntakeRuntime } from './runtime.ts';
import type { EmailIntakeDeps, S3EmailIntakeEvent } from './types.ts';

export function createEmailIntakeHandler(deps: EmailIntakeDeps) {
  return async (event: S3EmailIntakeEvent) => {
    try {
      return await processEmailIntakeEvent(event, deps);
    } catch (error: unknown) {
      const { name, message } = getErrorDetails(error);
      console.error('Email intake capture failed.', name, message);
      throw error;
    }
  };
}

export const handler = createEmailIntakeHandler(createEmailIntakeRuntime());
