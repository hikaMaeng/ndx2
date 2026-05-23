export const serviceDomain = Object.freeze({
  service: "ndx",
  packageName: "ndx"
});

export const workspaceSurfaces = Object.freeze({
  common: "common",
  admin: "admin",
  agent: "agent"
});

export {
  copyDirectoryRecursively,
  ensureDirectory,
  ndxBasePath,
  ndxFilePath,
  normalizeWslPath,
  readTextFileOptional,
  writeTextFileIfNotExists
} from "./file/index.js";
export type { CopyDirectoryOptions } from "./file/index.js";
export { createNDXLogger } from "./log/index.js";
export type { CreateNDXLoggerOptions, NDXLogContext, NDXLogLevel, NDXLogger } from "./log/index.js";
export { uuid7 } from "./uuid7/index.js";
export {
  normalizeResponseSummary,
  readResponsesStream,
  parseResponsesPayload,
  requestModelResponse
} from "./responseapi/index.js";
export type {
  ModelResponse,
  ResponseModelConfig,
  ResponseModelMessage,
  ResponseOutputEvent,
  ResponsePayloadResult
} from "./responseapi/index.js";
