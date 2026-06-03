import type { ReactNode } from "react";
import type { NDXSidebarItem } from "ndx/common/protocol";
import { TurnSidebarCards, type TurnFlowState } from "../../turn";

type RightSidebarProps = {
  children?: ReactNode;
  id?: string;
  label: string;
  scrollRef?: (node: HTMLDivElement | null) => void;
  onScroll?: (scrollTop: number) => void;
  items?: NDXSidebarItem[];
  turn?: TurnFlowState;
  width?: number;
};

export function RightSidebar({ children, id = "session-right-sidebar", label, scrollRef, onScroll, items, turn, width = 288 }: RightSidebarProps) {
  return (
    <aside id={id} className="hidden h-full max-h-dvh min-h-0 shrink-0 overflow-hidden border-l border-zinc-800 bg-zinc-950 text-zinc-100 md:flex md:flex-col" aria-label={label} style={{ width }}>
      <div ref={scrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]" onScroll={(event) => onScroll?.(event.currentTarget.scrollTop)}>
        <TurnSidebarCards items={items} turn={turn} />
        {children ?? ((items && items.length > 0) || turn ? null : <p className="text-xs leading-5 text-zinc-500">오른쪽 사이드바 영역입니다.</p>)}
      </div>
    </aside>
  );
}
