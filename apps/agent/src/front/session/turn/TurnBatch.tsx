import { Wrench } from "lucide-react";
import { ToolRun } from "./ToolRun";
import type { TurnBatchState } from "./types";

export function TurnBatch({ batch, onToggle }: { batch: TurnBatchState; onToggle?: (batch: TurnBatchState, open: boolean) => void }) {
  const hasAssistantText = batch.assistantText.trim().length > 0;
  const hasReasoningText = batch.reasoningText.trim().length > 0;

  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-900/70 p-3" open={!batch.collapsed} data-testid="turn-iteration" onToggle={(event) => {
      onToggle?.(batch, event.currentTarget.open);
    }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-200">
        <span className="flex items-center gap-2">
          <Wrench aria-hidden="true" className="h-4 w-4 text-cyan-300" />
          Iteration {batch.iteration}
        </span>
        <span className="text-xs font-normal text-zinc-500">{batch.tools.length} tool(s)</span>
      </summary>
      <div className="mt-3 grid gap-2">
        {hasAssistantText ? (
          <section aria-label={`Iteration ${batch.iteration} assistant text`} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Assistant text</p>
            <div className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{batch.assistantText}</div>
          </section>
        ) : null}
        {hasReasoningText ? (
          <section aria-label={`Iteration ${batch.iteration} reasoning`} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Reasoning</p>
            <div className="whitespace-pre-wrap text-xs leading-5 text-zinc-400">{batch.reasoningText}</div>
          </section>
        ) : null}
        {batch.modelEvents.length > 0 ? (
          <ol className="grid gap-1 text-xs text-zinc-500" aria-label={`Iteration ${batch.iteration} model request events`}>
            {batch.modelEvents.map((event, index) => <li key={`${batch.key}:model:${index}`}>{event}</li>)}
          </ol>
        ) : null}
        {batch.tools.map((tool) => <ToolRun key={tool.key} tool={tool} />)}
      </div>
    </details>
  );
}
