import type { LeadRecord, LeadRecordStatus } from '../domain/lead-record.ts';

export type LeadRecordsCursorKey = Record<string, unknown>;

export type LeadRecordsListPageArgs = {
  limit: number;
  qualifiedFilter: boolean | null;
  cursor?: LeadRecordsCursorKey;
};

export type LeadRecordsListPageResult = {
  items: LeadRecord[];
  lastEvaluatedKey?: LeadRecordsCursorKey;
};

export interface LeadRecordsRepo {
  getById(leadRecordId: string): Promise<LeadRecord | null>;
  listByContactId(contactId: string): Promise<LeadRecord[]>;
  listByStatus(status: LeadRecordStatus): Promise<LeadRecord[]>;
  listPage(args: LeadRecordsListPageArgs): Promise<LeadRecordsListPageResult>;
  put(leadRecord: LeadRecord): Promise<void>;
}
