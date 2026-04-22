import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, LeadPlatformTableKey } from './types.ts';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const defaultConfigPath = 'config/managed-conversion-destinations.json';
export const enabledPartition = 'enabled';
export const defaultListLimit = 25;
export const defaultWorkerNameContains = 'managedconversionfeedbackworker';

export const commandNames: Command[] = [
  'validate',
  'readiness',
  'sync',
  'list',
  'list-destinations',
  'runtime',
  'list-decisions',
  'list-outbox',
  'inspect-outbox',
  'dry-run-outbox',
  'invoke-worker',
  'env-template',
  'help',
];

export const tableEnvKeys: Record<LeadPlatformTableKey, string> = {
  contacts: 'LEAD_CONTACTS_TABLE_NAME',
  decisions: 'LEAD_CONVERSION_DECISIONS_TABLE_NAME',
  destinations: 'PROVIDER_CONVERSION_DESTINATIONS_TABLE_NAME',
  leadRecords: 'LEAD_RECORDS_TABLE_NAME',
  outbox: 'LEAD_CONVERSION_FEEDBACK_OUTBOX_TABLE_NAME',
  outcomes: 'LEAD_CONVERSION_FEEDBACK_OUTCOMES_TABLE_NAME',
};
