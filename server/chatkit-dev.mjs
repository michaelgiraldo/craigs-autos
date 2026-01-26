import http from 'node:http';
import { URL } from 'node:url';

import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load local env for dev (kept out of git via .gitignore).
dotenv.config({ path: '.env.local' });
dotenv.config();

const port = Number.parseInt(process.env.CHATKIT_DEV_PORT ?? '8787', 10);
const workflowId = process.env.CHATKIT_WORKFLOW_ID;
const apiKey = process.env.OPENAI_API_KEY;

if (!workflowId) {
  console.error('Missing CHATKIT_WORKFLOW_ID in env (.env.local).');
}
if (!apiKey) {
  console.error('Missing OPENAI_API_KEY in env (.env.local).');
}

const openai = new OpenAI({ apiKey });

const SHOP_TIMEZONE = 'America/Los_Angeles';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayToIndex(value) {
  const idx = WEEKDAYS.indexOf(value);
  return idx === -1 ? 0 : idx;
}

function minutesFromParts(hour, minute) {
  return hour * 60 + minute;
}

function formatTime12h(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function scheduleForWeekday(weekday) {
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

function computeShopState(now, timezone) {
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

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  // Vite dev proxy uses same-origin, but CORS makes direct calls easier.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.end();
      return;
    }

    if ((url.pathname === '/api/chatkit/session' || url.pathname === '/api/chatkit/session/') && req.method === 'POST') {
      if (!workflowId || !apiKey) {
        json(res, 500, { error: 'Server missing OPENAI_API_KEY or CHATKIT_WORKFLOW_ID' });
        return;
      }

      const payload = await readJson(req);
      const locale = typeof payload.locale === 'string' ? payload.locale : 'en';
      const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
      const user = typeof payload.user === 'string' ? payload.user : 'anonymous';
      const shopState = computeShopState(new Date(), SHOP_TIMEZONE);

      try {
        const session = await openai.beta.chatkit.sessions.create({
          user,
          workflow: {
            id: workflowId,
            // Keep parity with production: don't emit "Thought for ..." task items.
            tracing: { enabled: false },
            state_variables: {
              locale,
              page_url: pageUrl,
              ...shopState,
            },
          },
        });

        json(res, 200, { client_secret: session.client_secret });
      } catch (err) {
        console.error('ChatKit session create failed', err?.status, err?.message);
        json(res, 500, { error: 'Failed to create ChatKit session' });
      }
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Server error' });
  }
});

server.listen(port, () => {
  console.log(`ChatKit dev API listening on http://localhost:${port}`);
});
