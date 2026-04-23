import { defineBackend } from '@aws-amplify/backend';

import { configureLeadActionLinksTable } from './backend/dynamo/lead-action-links';
import { configureLeadDataTables } from './backend/dynamo/lead-data';
import { configureEmailIntake } from './backend/email-intake';
import { configureLeadAttachments } from './backend/lead-attachments';
import { applyLambdaDescriptions } from './backend/lambda-descriptions';
import { configureMonitoring } from './backend/monitoring';
import { configureLambdaPermissions } from './backend/permissions';
import { addPublicApiOutputs, createPublicHttpApi } from './backend/public-api';
import type { CraigsBackend } from './backend/types';
import { chatHandoffPromote } from './functions/chat-handoff-promote/resource';
import { leadInteractionCapture } from './functions/lead-interaction-capture/resource';
import { leadActionLinkResolve } from './functions/lead-action-link-resolve/resource';
import { chatSessionCreate } from './functions/chat-session-create/resource';
import { quoteRequestSubmit } from './functions/quote-request-submit/resource';
import { leadAttachmentUploadStart } from './functions/lead-attachment-upload-start/resource';
import { emailIntakeCapture } from './functions/email-intake-capture/resource';
import { leadAdminApi } from './functions/lead-admin-api/resource';
import { leadFollowupAlertMonitor } from './functions/lead-followup-alert-monitor/resource';
import { leadFollowupWorker } from './functions/lead-followup-worker/resource';
import { managedConversionFeedbackWorker } from './functions/managed-conversion-feedback-worker/resource';

const backend = defineBackend({
  quoteRequestSubmit,
  leadAttachmentUploadStart,
  emailIntakeCapture,
  leadFollowupWorker,
  leadFollowupAlertMonitor,
  managedConversionFeedbackWorker,
  chatSessionCreate,
  chatHandoffPromote,
  leadActionLinkResolve,
  leadInteractionCapture,
  leadAdminApi,
}) as CraigsBackend;

applyLambdaDescriptions(backend);
configureLambdaPermissions(backend);
configureLeadActionLinksTable(backend);
configureLeadDataTables(backend);
configureLeadAttachments(backend);
configureEmailIntake(backend);
configureMonitoring(backend);

const publicApiStack = backend.createStack('public-api');
const publicApi = createPublicHttpApi(publicApiStack, backend);
addPublicApiOutputs(backend, publicApi);
