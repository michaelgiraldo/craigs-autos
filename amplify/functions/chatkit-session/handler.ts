import OpenAI from 'openai';
import { z } from 'zod';
import { computeShopState } from '../../../shared/shop-hours.js';
import { decodeBody, emptyResponse, getHttpMethod, jsonResponse } from '../_shared/http.ts';

const SHOP_TIMEZONE = 'America/Los_Angeles';
const CHATKIT_UPLOAD_MAX_FILE_SIZE_MB = 12;
const CHATKIT_UPLOAD_MAX_FILES = 7;

const sessionEnvSchema = z.object({
  CHATKIT_WORKFLOW_ID: z.string().trim().min(1),
  OPENAI_API_KEY: z.string().trim().min(1),
});

const sessionPayloadSchema = z
  .object({
    current: z.unknown().optional(),
    locale: z.string().optional(),
    pageUrl: z.string().optional(),
    user: z.string().optional(),
  })
  .passthrough();

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

type ChatkitSessionRequest = z.infer<typeof sessionPayloadSchema>;

type SessionCreateResponse = {
  client_secret: string;
};

type SessionClient = {
  beta: {
    chatkit: {
      sessions: {
        create: (args: unknown) => Promise<SessionCreateResponse>;
      };
    };
  };
};

type SessionHandlerDeps = {
  hasValidConfig: boolean;
  workflowId: string;
  chatkitClient: SessionClient | null;
  shopTimezone: string;
};

export function createChatkitSessionHandler(deps: SessionHandlerDeps) {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    const method = getHttpMethod(event);

    if (method === 'OPTIONS') {
      // Lambda Function URL CORS handles the browser preflight automatically.
      return emptyResponse(204);
    }

    if (method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    if (!deps.hasValidConfig || !deps.chatkitClient || !deps.workflowId) {
      return jsonResponse(500, { error: 'Server missing configuration' });
    }

    let payload: ChatkitSessionRequest = {};
    try {
      const body = decodeBody(event);
      const parsed = body ? JSON.parse(body) : {};
      const result = sessionPayloadSchema.safeParse(
        parsed && typeof parsed === 'object' ? parsed : {},
      );
      if (!result.success) {
        return jsonResponse(400, { error: 'Invalid request payload' });
      }
      payload = result.data;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const locale = typeof payload.locale === 'string' ? payload.locale : 'en';
    const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
    const user = typeof payload.user === 'string' ? payload.user : 'anonymous';
    const shopState = computeShopState(new Date(), deps.shopTimezone);

    try {
      const session = await deps.chatkitClient.beta.chatkit.sessions.create({
        user,
        workflow: {
          id: deps.workflowId,
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

      return jsonResponse(200, { client_secret: session.client_secret });
    } catch (err: any) {
      console.error('ChatKit session create failed', err?.status, err?.message);
      return jsonResponse(500, { error: 'Failed to create ChatKit session' });
    }
  };
}

const parsedSessionEnv = sessionEnvSchema.safeParse(process.env);
const runtimeWorkflowId = parsedSessionEnv.success ? parsedSessionEnv.data.CHATKIT_WORKFLOW_ID : '';
const runtimeApiKey = parsedSessionEnv.success ? parsedSessionEnv.data.OPENAI_API_KEY : '';
const runtimeChatkitClient = runtimeApiKey
  ? (new OpenAI({ apiKey: runtimeApiKey }) as SessionClient)
  : null;

export const handler = createChatkitSessionHandler({
  hasValidConfig: parsedSessionEnv.success,
  workflowId: runtimeWorkflowId,
  chatkitClient: runtimeChatkitClient,
  shopTimezone: SHOP_TIMEZONE,
});
