import type { TurnFlowState } from "ndx/webclient/front";

export function TurnNavigation({
  turns,
  activeInputDataId,
  onSelect
}: {
  turns: TurnFlowState[];
  activeInputDataId?: string;
  onSelect: (inputDataId: string) => void;
}) {
  if (turns.length === 0) return null;

  return (
    <nav aria-label="턴 내비게이션" className="pointer-events-none sticky left-0 top-16 z-20 h-0 w-fit md:top-4">
      <ol className="pointer-events-auto max-h-[46vh] min-w-0 overflow-y-auto rounded-md border border-zinc-800/80 bg-zinc-950/85 px-2 py-2 shadow-lg shadow-black/30 backdrop-blur">
        {turns.map((turn, index) => {
          const active = turn.inputDataId === activeInputDataId;
          const title = turn.title.replace(/\s+/gu, " ").trim() || `Turn ${index + 1}`;
          return (
            <li key={turn.id} className="min-w-0">
              <button
                type="button"
                aria-current={active ? "location" : undefined}
                aria-label={`${index + 1}번째 턴으로 이동: ${title}`}
                title={title}
                className="group flex h-5 w-16 items-center justify-start rounded-sm px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100"
                onClick={() => onSelect(turn.inputDataId)}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "block rounded-full transition-all duration-150",
                    active
                      ? "h-2 w-12 bg-zinc-50 shadow-[0_0_10px_rgba(244,244,245,0.42)]"
                      : "h-1.5 w-5 bg-zinc-600 group-hover:w-8 group-hover:bg-zinc-300",
                    turn.status === "running" ? "animate-pulse" : ""
                  ].filter(Boolean).join(" ")}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
