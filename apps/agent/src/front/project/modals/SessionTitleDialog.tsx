import React from "react";
import { Loader2, X } from "lucide-react";
import type { NDXAgentWebSession } from "ndx/agent/web";
import { Button } from "../../components/ui/button";
import { RSC } from "../resource";

export function SessionTitleDialog({
  busy,
  error,
  session,
  t,
  onClose,
  onRename
}: {
  busy: boolean;
  error: string;
  session: NDXAgentWebSession;
  t: Record<string, string>;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const [title, setTitle] = React.useState(session.title);
  const labels = {
    cancel: t[RSC.PROJECT_SESSION_RENAME_DIALOG_CANCEL_BUTTON] || "취소",
    rename: t[RSC.PROJECT_SESSION_RENAME_DIALOG_SUBMIT_BUTTON] || "수정",
    renameSession: t[RSC.PROJECT_SESSION_RENAME_DIALOG_TITLE_TEXT] || "세션 이름 수정",
    renameSessionPending: t[RSC.PROJECT_SESSION_RENAME_DIALOG_PENDING_STATUS] || "세션 이름 수정 중",
    sessionTitle: t[RSC.PROJECT_SESSION_RENAME_DIALOG_TITLE_INPUT_LABEL] || "세션 제목"
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
      <section role="dialog" aria-modal="true" aria-busy={busy} className="grid w-full max-w-sm gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl" aria-labelledby="session-title-dialog-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="session-title-dialog-title" className="text-sm font-semibold text-zinc-100">{labels.renameSession}</h2>
          <Button type="button" variant="outline" size="sm" className="h-8 w-8 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800" aria-label={labels.cancel} disabled={busy} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); onRename(title); }}>
          <label className="grid gap-1 text-sm text-zinc-300">
            {labels.sessionTitle}
            <input value={title} disabled={busy} autoFocus className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50" onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>
          {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
          {busy ? <p role="status" className="text-xs text-zinc-500">{labels.renameSessionPending}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900" disabled={busy} onClick={onClose}>{labels.cancel}</Button>
            <Button type="submit" size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" disabled={busy}>
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {labels.rename}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
