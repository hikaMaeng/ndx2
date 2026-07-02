import React from "react";
import { Button } from "../../components/ui";

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
    <Button type="button" size={null} className="hidden h-full w-[3px] shrink-0 cursor-col-resize rounded-none border-r border-zinc-800 bg-zinc-950 p-0 hover:bg-zinc-900 md:flex" aria-label="왼쪽 사이드바 너비 조정" aria-orientation="vertical" role="separator" onPointerDown={startResize} />
  );
}
