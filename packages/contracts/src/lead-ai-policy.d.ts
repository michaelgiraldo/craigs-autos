export type LeadAiReasoningEffort = 'medium' | 'high';

export type LeadAiTaskPolicy = {
  readonly model: 'gpt-5.4-2026-03-05';
  readonly reasoning: {
    readonly effort: LeadAiReasoningEffort;
  };
  readonly maxOutputTokens: number;
};

export declare const LEAD_AI_TASK_POLICY: {
  readonly emailIntakeTriage: LeadAiTaskPolicy & {
    readonly reasoning: { readonly effort: 'medium' };
    readonly maxOutputTokens: 1000;
  };
  readonly chatTranscriptLeadSummary: LeadAiTaskPolicy & {
    readonly reasoning: { readonly effort: 'medium' };
    readonly maxOutputTokens: 1500;
  };
  readonly customerFollowupDraft: LeadAiTaskPolicy & {
    readonly reasoning: { readonly effort: 'high' };
    readonly maxOutputTokens: 2000;
  };
};

export declare const LEAD_AI_MODELS: {
  readonly emailIntakeClassification: 'gpt-5.4-2026-03-05';
  readonly chatLeadSummary: 'gpt-5.4-2026-03-05';
  readonly customerFollowupDraft: 'gpt-5.4-2026-03-05';
};
