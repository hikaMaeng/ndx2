export type NDXWebProviderRow = {
  title: string;
  type: "openai";
  url: string;
  token: string;
};

export type NDXWebModelRow = {
  key?: string;
  provider: string;
  model: string;
  contextsize: number;
  modalities: Array<"text" | "image" | "file">;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXWebEmbeddingSettingsRow = {
  provider: string;
  model: string;
};

export type NDXWebSettingsDocumentRow = {
  version: string;
  defaultModelKey: string;
  runtime: {
    maxModelIterations: number;
    loopDetectionInterval: number;
  };
  tools: {
    prompt_rewrite: {
      model: string;
    };
  };
  hooks: {
    StreamGuard: {
      MAX_REASONING_LENGTH: number;
    };
  };
  websearch: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    method: string;
    queryParam: string;
    providersJson: string;
  };
  otherJson: string;
  topLevelKeys: string[];
};

export type NDXWebSettingsDocumentInput = {
  version?: string;
  defaultModelKey?: string;
  runtime?: {
    maxModelIterations?: number;
    loopDetectionInterval?: number;
  };
  tools?: {
    prompt_rewrite?: {
      model?: string;
    };
  };
  hooks?: {
    StreamGuard?: {
      MAX_REASONING_LENGTH?: number;
    };
  };
  websearch?: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    method?: string;
    queryParam?: string;
    providersJson?: string;
  };
  otherJson?: string;
};

export type NDXWebProviderUpstreamModel = {
  id: string;
  contextsize?: number;
};
