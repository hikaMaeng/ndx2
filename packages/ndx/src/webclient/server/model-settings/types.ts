export type NDXWebProviderRow = {
  title: string;
  type: "openai";
  url: string;
  token: string;
};

export type NDXWebModelRow = {
  provider: string;
  model: string;
  contextsize: number;
  modalities: Array<"text" | "image" | "file">;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
};

export type NDXWebProviderUpstreamModel = {
  id: string;
  contextsize?: number;
};
