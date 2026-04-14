import type { LeadActionToken } from '../domain/types.ts';

export interface LeadActionTokensRepo {
  get(token: string): Promise<LeadActionToken | null>;
  put(token: LeadActionToken): Promise<void>;
  delete(token: string): Promise<void>;
}
