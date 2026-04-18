import type { CraigsBackend } from '../types';
import { configureChatLeadHandoffDedupeTable } from './chat-handoff-dedupe';
import { configureLeadDataTables } from './lead-data';
import { configureMessageLinkTokenTable } from './message-link-tokens';
import { configureQuoteSubmissionsTable } from './quote-submissions';

export function configureDynamoTables(backend: CraigsBackend): void {
  configureChatLeadHandoffDedupeTable(backend);
  configureQuoteSubmissionsTable(backend);
  configureMessageLinkTokenTable(backend);
  configureLeadDataTables(backend);
}
