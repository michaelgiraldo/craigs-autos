const GPT_5_4_MODEL = 'gpt-5.4-2026-03-05';

export const LEAD_AI_TASK_POLICY = {
  emailIntakeTriage: {
    model: GPT_5_4_MODEL,
    reasoning: { effort: 'medium' },
    maxOutputTokens: 1000,
  },
  chatTranscriptLeadSummary: {
    model: GPT_5_4_MODEL,
    reasoning: { effort: 'medium' },
    maxOutputTokens: 1500,
  },
  customerFollowupDraft: {
    model: GPT_5_4_MODEL,
    reasoning: { effort: 'high' },
    maxOutputTokens: 2000,
  },
};

export const LEAD_AI_MODELS = {
  emailIntakeClassification: LEAD_AI_TASK_POLICY.emailIntakeTriage.model,
  chatLeadSummary: LEAD_AI_TASK_POLICY.chatTranscriptLeadSummary.model,
  customerFollowupDraft: LEAD_AI_TASK_POLICY.customerFollowupDraft.model,
};
