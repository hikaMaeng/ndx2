import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import type { SocketState } from "../../app/types";

export function StatusLine({ label, state, text }: { label: string; state: SocketState | "ready"; text: string }) {
  const icon =
    state === "ready" || state === "connected" ? (
      <CircleCheck aria-hidden="true" className="h-4 w-4 text-emerald-500" />
    ) : state === "offline" || state === "error" ? (
      <CircleAlert aria-hidden="true" className="h-4 w-4 text-red-500" />
    ) : (
      <CircleDashed aria-hidden="true" className="h-4 w-4 text-zinc-500" />
    );

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="flex items-center gap-2 text-xs text-zinc-300">
        {icon}
        <span role="status">{text}</span>
      </span>
    </div>
  );
}
