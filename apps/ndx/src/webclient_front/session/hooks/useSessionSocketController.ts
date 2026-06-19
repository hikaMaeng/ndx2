import React from "react";
import { createSessionSocketHandlers } from "./socket/sessionSocketHandlers";
import { useSessionSocketCommands } from "./socket/useSessionSocketCommands";
import { useSessionSocketLifecycle } from "./socket/useSessionSocketLifecycle";
import type { UseSessionSocketControllerOptions } from "./socket/types";

export function useSessionSocketController(options: UseSessionSocketControllerOptions) {
  const liveSessionIdsRef = React.useRef<Set<string>>(new Set());
  const commands = useSessionSocketCommands(options);

  const handlers = createSessionSocketHandlers(options, {
    attachSession: commands.attachSession,
    liveSessionIdsRef
  });

  useSessionSocketLifecycle(options, {
    attachSession: commands.attachSession,
    handlers,
    liveSessionIdsRef
  });

  return commands;
}

export type { UseSessionSocketControllerOptions } from "./socket/types";
