import React from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import type { NDXSessionRequestQueueItem } from "ndx/common/protocol";

type RequestQueueBarProps = {
  collapsed: boolean;
  items: NDXSessionRequestQueueItem[];
  onCollapsedChange: (collapsed: boolean) => void;
  onDelete: (itemid: string) => void;
  onUpdate: (itemid: string, text: string) => void;
};

export function RequestQueueBar({ collapsed, items, onCollapsedChange, onDelete, onUpdate }: RequestQueueBarProps) {
  const [editing, setEditing] = React.useState<NDXSessionRequestQueueItem>();
  const [draft, setDraft] = React.useState("");
  if (items.length === 0) return null;
  return (
    <>
      <section className="shrink-0 border-t border-zinc-800 bg-zinc-950/95 px-4 py-2" aria-label="요청 큐">
        <div className="mx-auto grid w-full max-w-4xl gap-2">
          <button
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-left text-sm text-zinc-100 hover:border-zinc-700"
            aria-expanded={!collapsed}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <span className="min-w-0 truncate">요청 큐 {items.length}개</span>
            {collapsed ? <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronUp aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />}
          </button>
          {!collapsed ? (
            <ol className="grid gap-2">
              {items.map((item, index) => (
                <li key={item.itemid} className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 shrink-0 text-xs text-zinc-500">{index + 1}</span>
                    <p className="ndx-wrap-anywhere min-w-0 flex-1 whitespace-pre-wrap leading-5">{item.text || "첨부 요청"}</p>
                    <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="요청 큐 항목 수정" onClick={() => { setEditing(item); setDraft(item.text); }}>
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-red-200" aria-label="요청 큐 항목 삭제" onClick={() => onDelete(item.itemid)}>
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  {item.attachments?.length ? (
                    <p className="pl-6 text-xs text-zinc-500">첨부 {item.attachments.length}개</p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>
      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="presentation" onClick={() => setEditing(undefined)}>
          <section role="dialog" aria-modal="true" aria-labelledby="request-queue-edit-title" className="grid w-full max-w-2xl gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="request-queue-edit-title" className="text-sm font-semibold text-zinc-100">요청 큐 항목 수정</h2>
              <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" aria-label="수정 닫기" onClick={() => setEditing(undefined)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <textarea className="min-h-40 resize-y rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none focus:border-zinc-600" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-900" onClick={() => setEditing(undefined)}>취소</button>
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-100 px-3 text-sm font-medium text-zinc-950 hover:bg-white" onClick={() => { onUpdate(editing.itemid, draft.trim()); setEditing(undefined); }}>저장</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
