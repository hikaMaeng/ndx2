import { promises as fs } from "node:fs";
import { loadSkills } from "../../context/availableSkillsInstructions/loader.js";
import { appendSessionData } from "../../session/appendSessionData.js";
import { sessionDataText, toolResultContents } from "../../session/content.js";
import { listSessionData } from "../../session/listSessionData.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../index.js";

const SKILL_MARKER_PATTERN = /\[\[NDX_SKILL_([^\]\r\n]+)\]\]/g;

export const skillMarkerHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.request.received.skill_markers",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    const requested = [...context.requestText.matchAll(SKILL_MARKER_PATTERN)]
      .map((match) => decodeSkillName(match[1] ?? ""))
      .filter((name) => name.length > 0);
    if (requested.length === 0) {
      return { type: "noeffect", replaceRequestText: context.requestText };
    }

    const availableSkills = await loadSkills({
      userHome: context.userHome,
      projectHome: context.projectHome,
      cwd: context.projectHome
    });
    const skillsByName = new Map(availableSkills.map((skill) => [skill.name, skill]));
    const sessionRows = await listSessionData(context.database, context.session.sessionid);
    const loadedNames = new Set<string>();
    for (const row of sessionRows) {
      const text = sessionDataText(row) ?? JSON.stringify(row.contents);
      for (const match of text.matchAll(/<skill>\s*<name>([^<]+)<\/name>\s*<path>[^<]+<\/path>/g)) {
        if (match[1]?.trim()) {
          loadedNames.add(match[1].trim());
        }
      }
    }

    const diagnostics: string[] = [];
    for (const name of [...new Set(requested)]) {
      const skill = skillsByName.get(name);
      if (!skill) {
        diagnostics.push(`Skill is not available: ${name}`);
        continue;
      }
      if (loadedNames.has(skill.name)) {
        continue;
      }
      const body = await fs.readFile(skill.pathToSkillMd, "utf8");
      const output = `<skill>\n<name>${skill.name}</name>\n<path>${skill.pathToSkillMd}</path>\n${body}\n</skill>`;
      await appendSessionData(context.database, context.session.sessionid, "assistant", toolResultContents(0, [{
        toolCallId: `preload-skill:${skill.name}`,
        tool: "loadSkill",
        success: true,
        output
      }]));
      loadedNames.add(skill.name);
    }

    return {
      type: "noeffect",
      replaceRequestText: context.requestText.replace(SKILL_MARKER_PATTERN, (_match, rawName: string) => `$${decodeSkillName(rawName)}`),
      ...(diagnostics.length > 0 ? { diagnostics } : {})
    };
  }
};

function decodeSkillName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
