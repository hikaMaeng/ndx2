import type { NDXDatabase } from "ndx/agent/init";
import type { NDXAgentResourceResolver } from "ndx/common";
import type { NDXLogger } from "ndx/common";

export type AttachAgentWebRoutesOptions = {
  database?: NDXDatabase;
  sessionSocketPath: string;
  version: string;
  logger?: NDXLogger;
  resource?: NDXAgentResourceResolver;
};
