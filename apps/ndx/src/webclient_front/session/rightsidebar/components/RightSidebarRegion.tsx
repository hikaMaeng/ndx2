import React from "react";
import { GripVertical, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { SessionUiState } from "ndx/webclient/front";
import { RSC } from "../../../app/resource";
import { rightSidebarToggled, rightSidebarWithScrollTop, rightSidebarWithWidth, type UpdateSessionUi } from "../state";
import { RightSidebar } from "./RightSidebar";

function RightSidebarResizeHandle({ width, onWidthChange }: { width: number; onWidthChange: (width: number) => void }) {
  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      const viewportLimit = Math.max(240, window.innerWidth - 520);
      const rawWidth = startWidth + startX - moveEvent.clientX;
      onWidthChange(Math.min(Math.max(rawWidth, 240), Math.min(560, viewportLimit)));
    };
    const stop = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <button type="button" className="hidden h-full w-2 shrink-0 cursor-col-resize items-center justify-center border-l border-zinc-800 bg-zinc-950 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300 md:flex" aria-label="오른쪽 사이드바 너비 조정" aria-orientation="vertical" role="separator" onPointerDown={startResize}>
      <GripVertical aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

type RightSidebarRegionProps = {
  isActive: boolean;
  surfaceKey: string;
  t: Record<string, string>;
  ui: SessionUiState;
  updateSessionUi: UpdateSessionUi;
};

export function RightSidebarRegion({ isActive, surfaceKey, t, ui, updateSessionUi }: RightSidebarRegionProps) {
  const suffix = surfaceKey.replace(/[^a-z0-9_-]/giu, "-");
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (!isActive || !scrollRef.current) return;
    scrollRef.current.scrollTop = ui.rightSidebarScrollTop;
  }, [isActive, surfaceKey]);

  return (
    <>
      <button type="button" className="fixed right-4 top-4 z-20 hidden h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/95 p-0 text-sm font-medium text-zinc-500 shadow-lg shadow-black/30 transition-colors hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:inline-flex" aria-label={ui.rightSidebarOpen ? t[RSC.APP_SHELL_RIGHT_SIDEBAR_CLOSE_BUTTON] : t[RSC.APP_SHELL_RIGHT_SIDEBAR_OPEN_BUTTON]} aria-controls={`session-right-sidebar-${suffix}`} aria-expanded={ui.rightSidebarOpen} onClick={() => updateSessionUi(surfaceKey, rightSidebarToggled)}>
        {ui.rightSidebarOpen ? <PanelRightClose aria-hidden="true" className="h-4 w-4" /> : <PanelRightOpen aria-hidden="true" className="h-4 w-4" />}
      </button>
      {ui.rightSidebarOpen ? (
        <>
          <RightSidebarResizeHandle width={ui.rightSidebarWidth} onWidthChange={(width) => updateSessionUi(surfaceKey, (current) => rightSidebarWithWidth(current, width))} />
          <RightSidebar id={`session-right-sidebar-${suffix}`} label={t[RSC.SIDEBAR_RIGHT_LABEL]} scrollRef={(node) => { scrollRef.current = node; }} onScroll={(scrollTop) => updateSessionUi(surfaceKey, (current) => rightSidebarWithScrollTop(current, scrollTop))} items={ui.rightSidebarItems} width={ui.rightSidebarWidth} />
        </>
      ) : null}
    </>
  );
}
