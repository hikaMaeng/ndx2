import React from "react";
import type { NDXAgentWebContextUsage } from "ndx/webclient/front";
import { createSessionSocketHandlers } from "./socket/sessionSocketHandlers";
import { useSessionSocketCommands } from "./socket/useSessionSocketCommands";
import { useSessionSocketLifecycle } from "./socket/useSessionSocketLifecycle";
import type { UseSessionSocketControllerOptions } from "./socket/types";

export function useSessionSocketController(options: UseSessionSocketControllerOptions) {
  const liveSessionIdsRef = React.useRef<Set<string>>(new Set());
  const commands = useSessionSocketCommands(options);

  const updateContextUsage = (usage?: NDXAgentWebContextUsage) => {
    if (!usage) return;
    options.setReportedContextUsage((current) => ({
      ...usage,
      parts: usage.parts ?? current?.parts
    }));
  };

  const handlers = createSessionSocketHandlers(options, {
    attachSession: commands.attachSession,
    liveSessionIdsRef,
    updateContextUsage
  });

  useSessionSocketLifecycle(options, {
    attachSession: commands.attachSession,
    handlers,
    liveSessionIdsRef
  });

  return commands;
}

export type { UseSessionSocketControllerOptions } from "./socket/types";
