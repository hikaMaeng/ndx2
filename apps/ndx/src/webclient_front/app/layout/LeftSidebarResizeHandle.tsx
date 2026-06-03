import React from "react";
import { GripVertical } from "lucide-react";

export function LeftSidebarResizeHandle({ width, onWidthChange }: { width: number; onWidthChange: (width: number) => void }) {
  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      const viewportLimit = Math.max(220, window.innerWidth - 520);
      const rawWidth = startWidth + moveEvent.clientX - startX;
      onWidthChange(Math.min(Math.max(rawWidth, 220), Math.min(440, viewportLimit)));
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
    <button type="button" className="hidden h-full w-2 shrink-0 cursor-col-resize items-center justify-center border-r border-zinc-800 bg-zinc-950 text-zinc-600 hover:bg-zinc-900 hover:text-zinc-300 md:flex" aria-label="왼쪽 사이드바 너비 조정" aria-orientation="vertical" role="separator" onPointerDown={startResize}>
      <GripVertical aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
