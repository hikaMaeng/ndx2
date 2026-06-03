import { LOADED_SKILL } from "./LOADED_SKILL.js";
import { SKILL_LIST } from "./SKILL_LIST.js";
import type { NDXToolSystemArgHandler } from "./runtimeArgTypes.js";

export const SKILLLOADER_RUNTIME_ARG_HANDLERS = {
  "$SKILL_LIST": SKILL_LIST,
  "$LOADED_SKILL": LOADED_SKILL
} satisfies Record<string, NDXToolSystemArgHandler>;
