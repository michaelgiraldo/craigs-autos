import OpenAI from 'openai';

const workflowId = process.env.CHATKIT_WORKFLOW_ID;
const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

const SHOP_TIMEZONE = 'America/Los_Angeles';
const CHATKIT_UPLOAD_MAX_FILE_SIZE_MB = 12;
const CHATKIT_UPLOAD_MAX_FILES = 7;

type LambdaHeaders = Record<string, string | undefined>;

type LambdaEvent = {
  headers?: LambdaHeaders | null;
  requestContext?: { http?: { method?: string } } | null;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type ChatkitSessionRequest = {
  current?: unknown;
  locale?: unknown;
  pageUrl?: unknown;
  user?: unknown;
};

type ShopState = {
  shop_timezone: string;
  shop_local_weekday: string;
  shop_local_time_24h: string;
  shop_is_open_now: boolean;
  shop_next_open_day: string;
  shop_next_open_time: string;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function weekdayToIndex(value: string): number {
  const idx = WEEKDAYS.indexOf(value as (typeof WEEKDAYS)[number]);
  return idx === -1 ? 0 : idx;
}

function minutesFromParts(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function formatTime12h(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function scheduleForWeekday(weekday: string): { open: number; close: number } | null {
  switch (weekday) {
    case 'Monday':
    case 'Tuesday':
    case 'Wednesday':
    case 'Thursday':
    case 'Friday':
      return { open: minutesFromParts(8, 0), close: minutesFromParts(17, 0) };
    case 'Saturday':
      return { open: minutesFromParts(8, 0), close: minutesFromParts(14, 0) };
    default:
      return null;
  }
}

function computeShopState(now: Date, timezone: string): ShopState {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(now);

  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const hour = Number.parseInt(timeParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(timeParts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const localTime24h = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const nowMinutes = minutesFromParts(hour, minute);

  const todaySchedule = scheduleForWeekday(weekday);
  const isOpenNow = todaySchedule
    ? nowMinutes >= todaySchedule.open && nowMinutes < todaySchedule.close
    : false;

  const weekdayIndex = weekdayToIndex(weekday);
  let nextOpenDay = '';
  let nextOpenTime = '';

  for (let offset = 0; offset < 8; offset += 1) {
    const dayIndex = (weekdayIndex + offset) % 7;
    const dayName = WEEKDAYS[dayIndex];
    const schedule = scheduleForWeekday(dayName);
    if (!schedule) continue;

    if (offset === 0) {
      if (nowMinutes < schedule.open) {
        nextOpenDay = dayName;
        nextOpenTime = formatTime12h(schedule.open);
        break;
      }
      // If we're currently open or already past close, the next open is a future day.
      continue;
    }

    nextOpenDay = dayName;
    nextOpenTime = formatTime12h(schedule.open);
    break;
  }

  return {
    shop_timezone: timezone,
    shop_local_weekday: weekday,
    shop_local_time_24h: localTime24h,
    shop_is_open_now: isOpenNow,
    shop_next_open_day: nextOpenDay,
    shop_next_open_time: nextOpenTime,
  };
}

function json(statusCode: number, body: unknown): LambdaResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function decodeBody(event: LambdaEvent): string | null {
  const raw = event?.body;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (event?.isBase64Encoded) {
    return Buffer.from(raw, 'base64').toString('utf8');
  }
  return raw;
}

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const method = event?.requestContext?.http?.method ?? event?.httpMethod;

  if (method === 'OPTIONS') {
    // Lambda Function URL CORS handles the browser preflight automatically.
    return {
      statusCode: 204,
      headers: {},
      body: '',
    };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  if (!workflowId || !apiKey || !openai) {
    return json(500, { error: 'Server missing configuration' });
  }

  let payload: ChatkitSessionRequest = {};
  try {
    const body = decodeBody(event);
    const parsed = body ? JSON.parse(body) : {};
    payload = parsed && typeof parsed === 'object' ? (parsed as ChatkitSessionRequest) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const locale = typeof payload.locale === 'string' ? payload.locale : 'en';
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  const user = typeof payload.user === 'string' ? payload.user : 'anonymous';
  const shopState = computeShopState(new Date(), SHOP_TIMEZONE);

  try {
    const session = await openai.beta.chatkit.sessions.create({
      user,
      workflow: {
        id: workflowId,
        state_variables: {
          locale,
          page_url: pageUrl,
          ...shopState,
        },
      },
      chatkit_configuration: {
        file_upload: {
          enabled: true,
          max_file_size: CHATKIT_UPLOAD_MAX_FILE_SIZE_MB,
          max_files: CHATKIT_UPLOAD_MAX_FILES,
        },
      },
    });

    return json(200, { client_secret: session.client_secret });
  } catch (err: any) {
    console.error('ChatKit session create failed', err?.status, err?.message);
    return json(500, { error: 'Failed to create ChatKit session' });
  }
};
