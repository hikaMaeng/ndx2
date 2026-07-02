import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from "lucide-react";
import type { TurnToolState } from "ndx/webclient/front";

export function ToolRun({ tool }: { tool: TurnToolState }) {
  const Icon = tool.status === "running" ? Loader2 : tool.status === "succeeded" ? CheckCircle2 : tool.status === "queued" ? Circle : XCircle;
  return (
    <details className="w-full min-w-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2" data-testid="turn-tool-run">
      <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 text-sm text-zinc-200">
        <span className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tool.status === "running" ? "animate-spin text-sky-300" : tool.status === "succeeded" ? "text-emerald-300" : tool.status === "queued" ? "text-zinc-500" : "text-rose-300"}`} />
          <span className="truncate font-medium">{tool.tool}</span>
          <span className="shrink-0 text-xs text-zinc-500">{tool.status}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />
      </summary>
      <div className="mt-3 grid min-w-0 gap-2 overflow-hidden text-xs text-zinc-400">
        {tool.callId ? <p className="ndx-wrap-anywhere"><span className="text-zinc-500">call</span> {tool.callId}</p> : null}
        {tool.args ? <pre className="ndx-wrap-anywhere max-h-36 overflow-y-auto rounded bg-black/30 p-2 text-zinc-300">{JSON.stringify(tool.args, null, 2)}</pre> : null}
        {tool.progress.length > 0 ? (
          <ol className="grid min-w-0 gap-1" aria-label={`${tool.tool} progress`}>
            {tool.progress.map((item) => <li key={item.id} className="ndx-wrap-anywhere rounded bg-zinc-900 px-2 py-1">{item.text}</li>)}
          </ol>
        ) : <p className="text-zinc-600">No progress events yet.</p>}
        {tool.result ? (
          <section className="grid min-w-0 gap-1" aria-label={`${tool.tool} result`}>
            <p className="text-zinc-500">result</p>
            <pre className="ndx-wrap-anywhere max-h-72 overflow-y-auto rounded bg-black/40 p-2 text-zinc-300">{toolResultText(tool.result)}</pre>
          </section>
        ) : null}
      </div>
    </details>
  );
}

function toolResultText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return String(result ?? "");
  }
  const record = result as { output?: unknown; success?: unknown; status?: unknown; error?: unknown };
  const output = record.output;
  const details = [
    `status: ${typeof record.status === "string" ? record.status : record.success === false ? "failed" : "succeeded"}`,
    typeof record.error === "string" && record.error ? `error: ${record.error}` : "",
    typeof output === "string" ? output : JSON.stringify(output ?? result, null, 2)
  ].filter(Boolean);
  return details.join("\n\n");
}
