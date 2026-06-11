import path from "node:path";
import { fileURLToPath } from "node:url";

export interface NDXSystemSkillAsset {
  skillDirectoryName: string;
  sourceDirectories: string[];
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const NDX_SYSTEM_SKILL_ASSETS: NDXSystemSkillAsset[] = [
  systemSkillAsset("askUserQuestion", "ask_user_question"),
  systemSkillAsset("cot_work", "cot_solve"),
  systemSkillAsset("session_history", "session_history")
];

function systemSkillAsset(toolDirectoryName: string, skillDirectoryName: string): NDXSystemSkillAsset {
  return {
    skillDirectoryName,
    sourceDirectories: [
      path.join(moduleDirectory, toolDirectoryName, "systemSkill"),
      path.join(moduleDirectory, "base", toolDirectoryName, "systemSkill"),
      path.join(moduleDirectory, "..", "..", "..", "..", "src", "agent", "tool", "base", toolDirectoryName, "systemSkill")
    ]
  };
}
