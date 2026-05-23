import React from "react";
import { Check, ChevronDown, ChevronUp, Circle, Loader2 } from "lucide-react";
import { formatNDXCotWorkElapsed, type NDXCotWorkContents, type NDXCotWorkStepStatus } from "ndx/agent/common/protocol";

export function CotWorkOverlay({ agentRunning, work }: { agentRunning: boolean; work: NDXCotWorkContents }) {
  const [expanded, setExpanded] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const completedCount = work.steps.filter((step) => step.status === "completed").length;
  const activeStep = work.steps.find((step) => step.status === "in_progress");
  const timingUpdatedAt = work.timingUpdatedAt ? Date.parse(work.timingUpdatedAt) : now;
  const liveDeltaMs = agentRunning && activeStep && Number.isFinite(timingUpdatedAt) ? Math.max(0, now - timingUpdatedAt) : 0;
  const totalElapsedMs = (work.totalElapsedMs ?? 0) + liveDeltaMs;
  const panelId = "cot-work-steps";

  React.useEffect(() => {
    setNow(Date.now());
    if (!agentRunning || !work.steps.some((step) => step.status === "in_progress")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [agentRunning, work]);

  return (
    <section
      aria-label="Cot work"
      className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur"
      data-testid="cot-work-overlay"
    >
      <div className="mx-auto w-full max-w-4xl rounded-md border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/25">
        <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-3 px-3 py-2">
          <p className="min-w-0 truncate text-sm text-zinc-300" role="status">
            <span className="font-medium text-zinc-100">작업 진행</span>
            <span className="ml-2 text-zinc-500">{completedCount}/{work.steps.length} 완료</span>
            <span className="ml-2 text-cyan-200">{formatNDXCotWorkElapsed(totalElapsedMs)}</span>
            {!expanded && activeStep ? <span className="ml-2 text-zinc-400">{activeStep.task}</span> : null}
          </p>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            aria-controls={panelId}
            aria-expanded={expanded}
            aria-label={expanded ? "작업 진행 접기" : "작업 진행 펼치기"}
            title={expanded ? "작업 진행 접기" : "작업 진행 펼치기"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronUp aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
        {expanded ? (
          <div id={panelId} className="max-h-[min(22rem,40dvh)] overflow-y-auto border-t border-zinc-800 px-3 py-3">
            <ol className="grid gap-2" aria-label="Cot work steps">
              {work.steps.map((step, index) => (
                <li key={`${index}:${step.task}`} className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-2 text-sm leading-5 text-zinc-200">
                  <StatusIcon status={step.status} />
                  <span className={step.status === "completed" ? "text-zinc-500 line-through decoration-zinc-600" : ""}>{step.task}</span>
                  <span className="font-mono text-xs leading-5 text-zinc-500">{formatNDXCotWorkElapsed((step.elapsedMs ?? 0) + (step.status === "in_progress" ? liveDeltaMs : 0))}</span>
                </li>
              ))}
            </ol>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-3 border-t border-zinc-800 pt-2 text-xs leading-5 text-zinc-500">
              <p className="min-w-0">{work.reason}</p>
              <p className="font-mono text-cyan-200">{formatNDXCotWorkElapsed(totalElapsedMs)}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: NDXCotWorkStepStatus }) {
  if (status === "completed") {
    return <Check aria-label="completed" className="mt-0.5 h-4 w-4 text-emerald-400" />;
  }
  if (status === "in_progress") {
    return <Loader2 aria-label="in progress" className="mt-0.5 h-4 w-4 animate-spin text-sky-300" />;
  }
  return <Circle aria-label="pending" className="mt-0.5 h-4 w-4 text-zinc-600" />;
}
