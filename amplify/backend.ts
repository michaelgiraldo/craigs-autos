import { defineBackend } from '@aws-amplify/backend';

import { configureDynamoTables } from './backend/dynamo';
import { applyLambdaDescriptions } from './backend/lambda-descriptions';
import { configureLambdaPermissions } from './backend/permissions';
import { addPublicApiOutputs, createPublicHttpApi } from './backend/public-api';
import type { CraigsBackend } from './backend/types';
import { chatLeadHandoff } from './functions/chat-lead-handoff/resource';
import { chatkitLeadAdmin } from './functions/chatkit-lead-admin/resource';
import { chatkitLeadSignal } from './functions/chatkit-lead-signal/resource';
import { chatkitMessageLink } from './functions/chatkit-message-link/resource';
import { chatkitSession } from './functions/chatkit-session/resource';
import { contactSubmit } from './functions/contact-submit/resource';
import { quoteFollowup } from './functions/quote-followup/resource';

const backend = defineBackend({
  contactSubmit,
  quoteFollowup,
  chatkitSession,
  chatLeadHandoff,
  chatkitMessageLink,
  chatkitLeadSignal,
  chatkitLeadAdmin,
}) as CraigsBackend;

applyLambdaDescriptions(backend);
configureLambdaPermissions(backend);
configureDynamoTables(backend);

const publicApiStack = backend.createStack('public-api');
const publicApi = createPublicHttpApi(publicApiStack, backend);
addPublicApiOutputs(backend, publicApi);
