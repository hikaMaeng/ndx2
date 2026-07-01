import { NDX_TURN_EVENT } from "../../../../common/protocol/index.js";
import { appendSessionData } from "../../../session/appendSessionData.js";
import { skillContextContents } from "../../../session/content.js";
import { executeToolCalls } from "../../../tool/index.js";
import { NDX_SIDEBAR_ITEM_AGENTCALL_NAME } from "../../../tool/execute/agentcall/index.js";
import type { NDXHookCodeExecutor, NDXHookEffect } from "../../index.js";
import type { NDXModelMessage } from "../../../session/types.js";
import type { NDXToolRuntimeTurnContext } from "../../../tool/types.js";
import type { ResponseInputItem } from "ndx/common/responseapi";

export type NDXSkillMarkerHookInsertionEvent = typeof NDX_TURN_EVENT.RequestReceived;

const SKILL_MARKER_PATTERN = /\[\[NDX_SKILL_([^\]\r\n]+)\]\]/g;
const VISIBLE_SKILL_COMMAND_PATTERN = /^[ \t]*\$([A-Za-z][A-Za-z0-9._:-]*)(?=$|[ \t])/u;

type RequestedSkillMarker = {
  name: string;
  argument?: string;
};

export const skillMarkerHook: NDXHookCodeExecutor = {
  kind: "code",
  name: "system.turn.request.received.skill_markers",
  source: "system",
  async run(context): Promise<NDXHookEffect> {
    const parsed = parseSkillMarkerRequestText(context.requestText);
    const requested = parsed.requested;
    if (requested.length === 0) {
      return { type: "noeffect", replaceRequestText: context.requestText };
    }

    const diagnostics: string[] = [];
    const preloadedSkillKeys = new Set<string>();
    const uniqueRequests = new Map<string, { name: string; argument?: string }>();
    for (const skill of requested) {
      if (!uniqueRequests.has(skill.name)) {
        uniqueRequests.set(skill.name, skill);
      }
    }
    for (const { name, argument } of uniqueRequests.values()) {
      const [result] = await executeToolCalls([{
        type: "function_call",
        call_id: `preload-skill:${name}`,
        name: "loadSkill",
        arguments: JSON.stringify({ name })
      }], {
        cwd: context.projectHome,
        userHome: context.userHome,
        projectHome: context.projectHome,
        sessionid: context.session.sessionid,
        allowedToolNames: ["loadSkill"],
        denyToolResultEffects: true,
        agentCallHandlers: { [NDX_SIDEBAR_ITEM_AGENTCALL_NAME]: () => undefined },
        turnContext: turnContextFromMessages(context.messages ?? [])
      });
      if (!result?.success) {
        diagnostics.push(result?.output || result?.error || `Skill is not available: ${name}`);
        continue;
      }
      const loaded = parseLoadedSkillOutput(result.output) ?? parseAlreadyLoadedSkillOutput(result.output);
      if (!loaded) {
        continue;
      }
      const loadedKey = `${loaded.name}\0${loaded.path}`;
      if (preloadedSkillKeys.has(loadedKey)) {
        continue;
      }
      preloadedSkillKeys.add(loadedKey);
      await appendSessionData(context.database, context.session.sessionid, "system", skillContextContents(loaded.name, loaded.path, selectedSkillContextText(name, argument, loaded, result.output)));
    }

    return {
      type: "noeffect",
      replaceRequestText: parsed.replaceRequestText,
      ...(diagnostics.length > 0 ? { diagnostics } : {})
    };
  }
};

function parseSkillMarkerRequestText(requestText: string): { requested: RequestedSkillMarker[]; replaceRequestText: string } {
  const requested: RequestedSkillMarker[] = [];
  let replaceRequestText = "";
  const linePattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(requestText)) !== null) {
    const line = match[1] ?? "";
    const ending = match[2] ?? "";
    if (line.length === 0 && ending.length === 0 && match.index === requestText.length) {
      break;
    }

    const markerMatches = [...line.matchAll(SKILL_MARKER_PATTERN)];
    if (markerMatches.length === 0) {
      const visibleCommand = line.match(VISIBLE_SKILL_COMMAND_PATTERN);
      if (visibleCommand?.[1]) {
        const commandStart = visibleCommand[0].indexOf("$");
        const commandEnd = commandStart + visibleCommand[1].length + 1;
        const restOfLine = line.slice(commandEnd);
        const argument = /^[ \t]+/.test(restOfLine) && restOfLine.trim().length > 0 ? restOfLine.trim() : undefined;
        requested.push({ name: visibleCommand[1], argument });
      }
      replaceRequestText += line + ending;
      if (ending.length === 0) {
        break;
      }
      continue;
    }

    const argumentByMarkerStart = new Map<number, string>();
    if (markerMatches.length === 1) {
      const marker = markerMatches[0];
      const markerStart = marker.index ?? 0;
      const markerEnd = markerStart + marker[0].length;
      const restOfLine = line.slice(markerEnd);
      if (/^[ \t]+/.test(restOfLine)) {
        const argument = restOfLine.trim();
        if (argument.length > 0) {
          argumentByMarkerStart.set(markerStart, argument);
        }
      }
    }

    let nextIndex = 0;
    let replacedLine = "";
    for (const marker of markerMatches) {
      const markerStart = marker.index ?? 0;
      const markerEnd = markerStart + marker[0].length;
      const name = decodeSkillName(marker[1] ?? "");
      if (name.length === 0) {
        continue;
      }
      const argument = argumentByMarkerStart.get(markerStart);
      requested.push({ name, argument });
      replacedLine += line.slice(nextIndex, markerStart);
      replacedLine += `$${name}${argument ? ` ${argument}` : ""}`;
      nextIndex = argument ? line.length : markerEnd;
    }
    replacedLine += line.slice(nextIndex);
    replaceRequestText += replacedLine + ending;
    if (ending.length === 0) {
      break;
    }
  }
  return { requested, replaceRequestText };
}

function turnContextFromMessages(messages: ResponseInputItem[]): NDXToolRuntimeTurnContext {
  const developer = isModelMessage(messages[0]) && messages[0].role === "system" ? messages[0] : { role: "system" as const, content: "" };
  const userIndex = developer === messages[0] ? 1 : 0;
  const user = isModelMessage(messages[userIndex]) && messages[userIndex].role === "user" ? messages[userIndex] : { role: "user" as const, content: "" };
  const historyStart = user === messages[userIndex] ? userIndex + 1 : userIndex;
  return {
    developer,
    user,
    history: messages.slice(historyStart)
  };
}

function isModelMessage(message: ResponseInputItem | undefined): message is NDXModelMessage {
  return Boolean(
    message &&
    typeof message === "object" &&
    typeof (message as { role?: unknown }).role === "string" &&
    (typeof (message as { content?: unknown }).content === "string" || Array.isArray((message as { content?: unknown }).content))
  );
}

function parseLoadedSkillOutput(output: string): { name: string; path: string } | undefined {
  const name = output.match(/<skill>\s*<name>([^<]+)<\/name>/)?.[1]?.trim();
  const skillPath = output.match(/<path>([^<]+)<\/path>/)?.[1]?.trim();
  return name && skillPath ? { name, path: skillPath } : undefined;
}

function parseAlreadyLoadedSkillOutput(output: string): { name: string; path: string } | undefined {
  const match = output.match(/Skill already loaded in the current session context:\s*(.+?)\s*\((.+?)\)\s*$/);
  const name = match?.[1]?.trim();
  const skillPath = match?.[2]?.trim();
  return name && skillPath ? { name, path: skillPath } : undefined;
}

function selectedSkillContextText(requestedName: string, argument: string | undefined, loaded: { name: string; path: string }, output: string): string {
  const selectedCommand = `$${requestedName}${argument ? ` ${argument}` : ""}`;
  const selectedInstruction = [
    "<selected_skill_instruction>",
    `The user explicitly selected \`${selectedCommand}\` for this request.`,
    ...(argument ? [
      `The selected skill argument is \`${argument}\`.`,
      "When this skill defines optional arguments, apply this argument to the workflow."
    ] : []),
    "The selected skill is model-visible before the first model iteration.",
    "You must apply this skill's workflow to the current request.",
    "Do not call `loadSkill` for this skill again unless the skill block is missing or unreadable.",
    "</selected_skill_instruction>"
  ].join("\n");
  if (parseLoadedSkillOutput(output)) {
    return `${selectedInstruction}\n\n${output}`;
  }
  return [
    selectedInstruction,
    "",
    "<selected_skill_ref>",
    `<name>${loaded.name}</name>`,
    `<path>${loaded.path}</path>`,
    "The full <skill> block for this skill is already present earlier in the session context.",
    "</selected_skill_ref>"
  ].join("\n");
}

function decodeSkillName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}
