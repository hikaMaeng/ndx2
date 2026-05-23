export const agentDomain = Object.freeze({
  surface: "agent",
  runtime: "common"
});

export * from "./protocol/index.js";
export * from "./resource/index.js";
export {
  copyDirectoryRecursively,
  ensureDirectory,
  ndxBasePath,
  ndxFilePath,
  normalizeWslPath,
  readTextFileOptional,
  writeTextFileIfNotExists
} from "../../common/file/index.js";
export type { CopyDirectoryOptions } from "../../common/file/index.js";
