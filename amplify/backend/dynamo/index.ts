import type { CraigsBackend } from '../types';
import { configureChatHandoffPromoteDedupeTable } from './chat-handoff-dedupe';
import { configureLeadActionLinksTable } from './lead-action-links';
import { configureLeadDataTables } from './lead-data';
import { configureQuoteRequestsTable } from './quote-requests';

export function configureDynamoTables(backend: CraigsBackend): void {
  configureChatHandoffPromoteDedupeTable(backend);
  configureQuoteRequestsTable(backend);
  configureLeadActionLinksTable(backend);
  configureLeadDataTables(backend);
}
