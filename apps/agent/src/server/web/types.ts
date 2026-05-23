import type { NDXDatabase } from "ndx/agent/server";
import type { NDXAgentResourceResolver } from "ndx/agent/common";
import type { NDXLogger } from "ndx/common";

export type AttachAgentWebRoutesOptions = {
  database?: NDXDatabase;
  sessionSocketPath: string;
  version: string;
  logger?: NDXLogger;
  resource?: NDXAgentResourceResolver;
};
