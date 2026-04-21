import type { CraigsBackend } from '../types';
import { configureLeadActionLinksTable } from './lead-action-links';
import { configureLeadDataTables } from './lead-data';

export function configureDynamoTables(backend: CraigsBackend): void {
  configureLeadActionLinksTable(backend);
  configureLeadDataTables(backend);
}
