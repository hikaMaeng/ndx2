import type { ReactNode } from "react";
import { TurnSidebarCards, type TurnFlowState } from "../../session/turn";

type RightSidebarProps = {
  children?: ReactNode;
  label: string;
  turn?: TurnFlowState;
  width?: number;
};

export function RightSidebar({ children, label, turn, width = 288 }: RightSidebarProps) {
  return (
    <aside id="session-right-sidebar" className="hidden h-full max-h-dvh min-h-0 shrink-0 overflow-hidden border-l border-zinc-800 bg-zinc-950 text-zinc-100 md:flex md:flex-col" aria-label={label} style={{ width }}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]">
        <TurnSidebarCards turn={turn} />
        {children ?? (turn ? null : <p className="text-xs leading-5 text-zinc-500">오른쪽 사이드바 영역입니다.</p>)}
      </div>
    </aside>
  );
}
