import { defineBackend } from '@aws-amplify/backend';

import { configureDynamoTables } from './backend/dynamo';
import { applyLambdaDescriptions } from './backend/lambda-descriptions';
import { configureLambdaPermissions } from './backend/permissions';
import { addPublicApiOutputs, createPublicHttpApi } from './backend/public-api';
import type { CraigsBackend } from './backend/types';
import { chatHandoffPromote } from './functions/chat-handoff-promote/resource';
import { leadInteractionCapture } from './functions/lead-interaction-capture/resource';
import { leadActionLinkResolve } from './functions/lead-action-link-resolve/resource';
import { chatSessionCreate } from './functions/chat-session-create/resource';
import { quoteRequestSubmit } from './functions/quote-request-submit/resource';
import { leadAdminApi } from './functions/lead-admin-api/resource';
import { leadFollowupWorker } from './functions/lead-followup-worker/resource';
import { managedConversionFeedbackWorker } from './functions/managed-conversion-feedback-worker/resource';

const backend = defineBackend({
  quoteRequestSubmit,
  leadFollowupWorker,
  managedConversionFeedbackWorker,
  chatSessionCreate,
  chatHandoffPromote,
  leadActionLinkResolve,
  leadInteractionCapture,
  leadAdminApi,
}) as CraigsBackend;

applyLambdaDescriptions(backend);
configureLambdaPermissions(backend);
configureDynamoTables(backend);

const publicApiStack = backend.createStack('public-api');
const publicApi = createPublicHttpApi(publicApiStack, backend);
addPublicApiOutputs(backend, publicApi);
