import { Activity, ChevronDown } from "lucide-react";
import { TurnBatch } from "./TurnBatch";
import type { TurnBatchState, TurnFlowState } from "ndx/webclient/front";

export function TurnFlow({ turns, onTurnToggle, onIterationToggle }: { turns: TurnFlowState[]; onTurnToggle?: (turn: TurnFlowState, open: boolean) => void; onIterationToggle?: (turn: TurnFlowState, batch: TurnBatchState, open: boolean, userInitiated: boolean) => void }) {
  if (turns.length === 0) return null;
  return (
    <section aria-label="Turn progress" className="grid min-w-0 gap-3" data-testid="turn-progress">
      {turns.map((turn) => (
        <details key={turn.id} className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-sm text-zinc-300" open={!turn.collapsed} onToggle={(event) => {
          onTurnToggle?.(turn, event.currentTarget.open);
        }}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Activity aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-300" />
              <span className="truncate font-medium text-zinc-100">{turn.status === "completed" ? "Completed turn" : turn.status === "interrupted" ? "Interrupted turn" : "Running turn"}</span>
              {turn.batches.length > 0 ? <span className="shrink-0 text-xs text-zinc-500">{turn.batches.length} batch(es)</span> : null}
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-500" />
          </summary>
          <div className="mt-3 grid gap-3">
            {turn.batches.map((batch) => <TurnBatch key={batch.key} batch={batch} onToggle={(nextBatch, open, userInitiated) => onIterationToggle?.(turn, nextBatch, open, userInitiated)} />)}
          </div>
        </details>
      ))}
    </section>
  );
}
