function truncate(value: string, maxChars = 500): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

const QUO_API_BASE_URL = 'https://api.openphone.com/v1';

function isQuoPhoneNumberId(value: string): boolean {
  return /^PN[\w-]+$/.test(value);
}

function isQuoUserId(value: string): boolean {
  return /^US[\w-]+$/.test(value);
}

function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

async function readQuoJson(response: Response): Promise<Record<string, unknown> | null> {
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`QUO request failed (${response.status}): ${truncate(responseText)}`);
  }
  return asObject(safeJsonParse(responseText));
}

function buildQuoHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: apiKey,
    'Content-Type': 'application/json',
  };
}

export type QuoSendTextMessageResult = {
  id: string;
  status: string | null;
};

export type QuoContactCustomFieldDefinition = {
  key: string;
  name: string;
  type: string | null;
};

export type QuoContactCustomFieldValue = {
  key: string;
  value: string[];
};

export type QuoContactRecord = {
  id: string;
  source: string | null;
  externalId: string | null;
  customFields: QuoContactCustomFieldValue[];
};

export type QuoContactUpsertRequest = {
  source: string;
  sourceUrl?: string;
  externalId: string;
  defaultFields: {
    firstName?: string;
    lastName?: string;
    phoneNumbers?: Array<{ name: string; value: string }>;
    emails?: Array<{ name: string; value: string }>;
  };
  customFields: Array<{ key: string; value: string[] }>;
};

function parseQuoContactCustomFields(value: unknown): QuoContactCustomFieldValue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asObject(item);
      const key = asString(record?.key);
      if (!key) return null;
      const rawValue = record?.value;
      const values = asStringArray(rawValue);
      return {
        key,
        value: values,
      } satisfies QuoContactCustomFieldValue;
    })
    .filter((item): item is QuoContactCustomFieldValue => Boolean(item));
}

function parseQuoContactRecord(value: unknown): QuoContactRecord | null {
  const record = asObject(value);
  const id = asString(record?.id);
  if (!id) return null;
  return {
    id,
    source: asString(record?.source),
    externalId: asString(record?.externalId),
    customFields: parseQuoContactCustomFields(record?.customFields),
  };
}

export async function sendQuoTextMessage(args: {
  apiKey: string;
  fromPhoneNumberId: string;
  toE164: string;
  content: string;
  userId?: string | null;
}): Promise<QuoSendTextMessageResult> {
  const apiKey = args.apiKey.trim();
  const fromPhoneNumberId = args.fromPhoneNumberId.trim();
  const toE164 = args.toE164.trim();
  const content = args.content.trim();
  const userId = typeof args.userId === 'string' ? args.userId.trim() : '';

  if (!apiKey) throw new Error('QUO API key is missing');
  if (!isQuoPhoneNumberId(fromPhoneNumberId)) {
    throw new Error('QUO from phone number ID must start with PN');
  }
  if (!/^\+[1-9]\d{7,14}$/.test(toE164)) {
    throw new Error('QUO recipient phone must be E.164 formatted');
  }
  if (!content) throw new Error('QUO text content is empty');
  if (userId && !isQuoUserId(userId)) {
    throw new Error('QUO user ID must start with US');
  }

  const response = await fetch(`${QUO_API_BASE_URL}/messages`, {
    method: 'POST',
    headers: buildQuoHeaders(apiKey),
    body: JSON.stringify({
      content,
      from: fromPhoneNumberId,
      to: [toE164],
      ...(userId ? { userId } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = await readQuoJson(response);
  const data = parsed?.data as { id?: unknown; status?: unknown } | undefined;
  const id = typeof data?.id === 'string' ? data.id.trim() : '';
  const status = typeof data?.status === 'string' ? data.status.trim() : null;

  if (!id) {
    throw new Error('QUO send response did not include a message ID');
  }

  return { id, status };
}

export async function listQuoContactCustomFields(args: {
  apiKey: string;
}): Promise<QuoContactCustomFieldDefinition[]> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) throw new Error('QUO API key is missing');

  const response = await fetch(`${QUO_API_BASE_URL}/contact-custom-fields`, {
    method: 'GET',
    headers: buildQuoHeaders(apiKey),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = await readQuoJson(response);
  const data = Array.isArray(parsed?.data) ? parsed.data : [];

  return data
    .map((item) => {
      const record = asObject(item);
      const key = asString(record?.key);
      const name = asString(record?.name);
      if (!key || !name) return null;
      return {
        key,
        name,
        type: asString(record?.type),
      } satisfies QuoContactCustomFieldDefinition;
    })
    .filter((item): item is QuoContactCustomFieldDefinition => Boolean(item));
}

export async function listQuoContacts(args: {
  apiKey: string;
  externalIds?: string[];
  sources?: string[];
  maxResults?: number;
}): Promise<QuoContactRecord[]> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) throw new Error('QUO API key is missing');

  const url = new URL(`${QUO_API_BASE_URL}/contacts`);
  for (const externalId of args.externalIds ?? []) {
    const trimmed = externalId.trim();
    if (trimmed) url.searchParams.append('externalIds', trimmed);
  }
  for (const source of args.sources ?? []) {
    const trimmed = source.trim();
    if (trimmed) url.searchParams.append('sources', trimmed);
  }
  if (typeof args.maxResults === 'number' && Number.isFinite(args.maxResults) && args.maxResults > 0) {
    url.searchParams.set('maxResults', String(Math.min(Math.floor(args.maxResults), 100)));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildQuoHeaders(apiKey),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = await readQuoJson(response);
  const data = Array.isArray(parsed?.data) ? parsed.data : [];
  return data
    .map((item) => parseQuoContactRecord(item))
    .filter((item): item is QuoContactRecord => Boolean(item));
}

function validateQuoContactUpsertRequest(payload: QuoContactUpsertRequest): void {
  if (!payload.source.trim()) throw new Error('QUO contact source is missing');
  if (!payload.externalId.trim()) throw new Error('QUO contact external ID is missing');
  if (!payload.defaultFields.phoneNumbers?.length && !payload.defaultFields.emails?.length) {
    throw new Error('QUO contact upsert requires at least one phone number or email');
  }
}

function parseQuoContactResponse(value: unknown): QuoContactRecord | null {
  const record = asObject(value);
  if (!record) return null;
  const direct = parseQuoContactRecord(record);
  if (direct) return direct;
  return parseQuoContactRecord(record.contact);
}

export async function createQuoContact(args: {
  apiKey: string;
  payload: QuoContactUpsertRequest;
}): Promise<QuoContactRecord> {
  const apiKey = args.apiKey.trim();
  if (!apiKey) throw new Error('QUO API key is missing');
  validateQuoContactUpsertRequest(args.payload);

  const response = await fetch(`${QUO_API_BASE_URL}/contacts`, {
    method: 'POST',
    headers: buildQuoHeaders(apiKey),
    body: JSON.stringify(args.payload),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = await readQuoJson(response);
  const contact = parseQuoContactResponse(parsed?.data);
  if (!contact) {
    throw new Error('QUO create contact response did not include a contact');
  }
  return contact;
}

export async function updateQuoContact(args: {
  apiKey: string;
  contactId: string;
  payload: QuoContactUpsertRequest;
}): Promise<QuoContactRecord> {
  const apiKey = args.apiKey.trim();
  const contactId = args.contactId.trim();
  if (!apiKey) throw new Error('QUO API key is missing');
  if (!contactId) throw new Error('QUO contact ID is missing');
  validateQuoContactUpsertRequest(args.payload);

  const response = await fetch(`${QUO_API_BASE_URL}/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    headers: buildQuoHeaders(apiKey),
    body: JSON.stringify(args.payload),
    signal: AbortSignal.timeout(8_000),
  });

  const parsed = await readQuoJson(response);
  const contact = parseQuoContactResponse(parsed?.data);
  if (!contact) {
    throw new Error('QUO update contact response did not include a contact');
  }
  return contact;
}
