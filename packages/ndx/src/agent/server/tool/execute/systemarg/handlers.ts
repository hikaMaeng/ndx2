import { LOADED_SKILL } from "./LOADED_SKILL.js";
import { SKILL_LIST } from "./SKILL_LIST.js";
import type { NDXToolRuntimeArgName } from "../../types.js";
import type { NDXToolSystemArgHandler } from "./types.js";

export const TOOL_RUNTIME_ARG_HANDLERS = {
  "$SKILL_LIST": SKILL_LIST,
  "$LOADED_SKILL": LOADED_SKILL
} satisfies Record<NDXToolRuntimeArgName, NDXToolSystemArgHandler>;
