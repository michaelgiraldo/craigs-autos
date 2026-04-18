import { defineBackend } from '@aws-amplify/backend';

import { configureDynamoTables } from './backend/dynamo';
import { createBackendFunctionUrls } from './backend/function-urls';
import { applyLambdaDescriptions } from './backend/lambda-descriptions';
import { addBackendOutputs } from './backend/outputs';
import { configureLambdaPermissions } from './backend/permissions';
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
const functionUrls = createBackendFunctionUrls(backend);
configureLambdaPermissions(backend);
configureDynamoTables(backend);
addBackendOutputs(backend, functionUrls);
