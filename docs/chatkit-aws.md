# ChatKit backend (AWS Lambda + SES)

This site uses the managed ChatKit workflow. The frontend calls:

1. `POST /api/chatkit/session` -> creates a ChatKit session and returns a `client_secret`.

Transcript delivery is triggered server-side (for example, by a workflow tool or a backend
handler that receives a "send recap" signal) and can call:

2. `POST /api/chatkit/transcript` -> fetches the thread transcript and emails it via SES.

## Environment variables

- `OPENAI_API_KEY`
- `CHATKIT_WORKFLOW_ID` (example: `wf_69701d08e45881908e395e9416c67caf0afd07bfe0b9c68a`)
- `SES_REGION` (example: `us-west-2`)
- `SES_FROM_EMAIL` (a verified sender in SES)
- `SES_TO_EMAIL` (your Google Workspace inbox for transcripts)
- `SES_REPLY_TO` (optional, defaults to `SES_FROM_EMAIL`)
- `ALLOW_USER_RECAP` (`true` to also email the recap to the visitor)

## AWS SES notes

- SES must be out of sandbox to send to arbitrary user emails.
- Verify the sender domain/email and add SPF/DKIM records in DNS.

## Lambda handler example (Node 18)

```js
import OpenAI from 'openai';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ses = new SESClient({ region: process.env.SES_REGION });
const workflowId = process.env.CHATKIT_WORKFLOW_ID;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const readBody = (event) => {
  if (!event.body) return {};
  return event.isBase64Encoded
    ? JSON.parse(Buffer.from(event.body, 'base64').toString('utf8'))
    : JSON.parse(event.body);
};

const formatItems = (items) =>
  items
    .map((item) => {
      const role = item.type === 'assistant_message' ? 'Assistant' : 'User';
      const text = (item.content || [])
        .map((chunk) => chunk.text)
        .filter(Boolean)
        .join(' ');
      return text ? `${role}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

const sendEmail = async ({ subject, body, to, replyTo }) => {
  const command = new SendEmailCommand({
    Destination: { ToAddresses: to },
    Message: {
      Subject: { Data: subject },
      Body: { Text: { Data: body } },
    },
    Source: process.env.SES_FROM_EMAIL,
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
  });
  await ses.send(command);
};

export const handler = async (event) => {
  const path = event.rawPath || event.path || '';
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';

  if (path.endsWith('/api/chatkit/session') && method === 'POST') {
    const { locale, user, pageUrl } = readBody(event);
    const session = await openai.beta.chatkit.sessions.create({
      user: user || 'anonymous',
      workflow: {
        id: workflowId,
        state_variables: {
          locale: locale || 'en',
          page_url: pageUrl || '',
        },
      },
    });
    return json(200, { client_secret: session.client_secret });
  }

  if (path.endsWith('/api/chatkit/transcript') && method === 'POST') {
    const payload = readBody(event);
    const { threadId, email, name, phone, vehicle, details, mode, pageUrl } = payload;

    const page = await openai.beta.chatkit.threads.listItems(threadId, {
      order: 'asc',
      limit: 100,
    });

    const transcript = formatItems(page.data || []);
    const header = [
      `Mode: ${mode || 'quote'}`,
      `Name: ${name || ''}`,
      `Email: ${email || ''}`,
      `Phone: ${phone || ''}`,
      `Vehicle: ${vehicle || ''}`,
      `Details: ${details || ''}`,
      `Page: ${pageUrl || ''}`,
    ].join('\n');

    const body = `${header}\n\n---\n\n${transcript}`;
    const subject = `[Chat] ${name || 'Website visitor'} - ${mode || 'quote'}`;

    const to = [process.env.SES_TO_EMAIL];
    if (process.env.ALLOW_USER_RECAP === 'true' && mode === 'recap' && email) {
      to.push(email);
    }

    await sendEmail({
      subject,
      body,
      to,
      replyTo: email || process.env.SES_REPLY_TO,
    });

    return json(200, { ok: true });
  }

  return json(404, { error: 'Not found' });
};
```

## Deploy options

- **Lambda + API Gateway**: map routes to the handler above.
- **Lambda Function URL**: easier setup, then reverse proxy `/api/chatkit/*` from your hosting layer.

## Wiring to the frontend

The widget reads:

- `/api/chatkit/session`

If you host your backend elsewhere, update the `data-chat-session-url` attribute in
`src/components/ChatWidget.astro`.
