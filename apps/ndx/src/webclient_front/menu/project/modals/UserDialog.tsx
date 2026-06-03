import { Plus, X } from "lucide-react";
import type { NDXAgentWebUser, NDXWebClientProject } from "ndx/webclient/common";
import { RSC } from "../resource";

export function UserDialog({
  busy,
  newUserid,
  project,
  t,
  users,
  onClose,
  onCreate,
  onNewUseridChange,
  onSelect
}: {
  busy: boolean;
  newUserid: string;
  project: NDXWebClientProject;
  t: Record<string, string>;
  users: NDXAgentWebUser[];
  onClose: () => void;
  onCreate: () => void;
  onNewUseridChange: (userid: string) => void;
  onSelect: (userid: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
      <section role="dialog" aria-modal="true" aria-busy={busy} className="grid w-full max-w-sm gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl" aria-labelledby="project-user-dialog-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="project-user-dialog-title" className="text-sm font-semibold text-zinc-100">{t[RSC.PROJECT_USER_DIALOG_TITLE_TEXT]}</h2>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" aria-label={t[RSC.PROJECT_USER_DIALOG_CLOSE_BUTTON]} disabled={busy} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2">
            {users.map((user) => (
              <button
                key={user.userid}
                type="button"
                className={user.userid === project.userid ? "rounded-md border border-emerald-700 bg-emerald-950/40 px-3 py-2 text-left text-sm text-emerald-200 disabled:pointer-events-none disabled:opacity-50" : "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50"}
                disabled={busy}
                onClick={() => onSelect(user.userid)}
              >
                {user.userid}
              </button>
            ))}
          </div>
          <div className="grid gap-2 border-t border-zinc-800 pt-3">
            <label className="grid gap-1 text-sm text-zinc-300">
              {t[RSC.PROJECT_USER_DIALOG_NEW_USER_INPUT_LABEL]}
              <input value={newUserid} disabled={busy} className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-50" onChange={(event) => onNewUseridChange(event.currentTarget.value)} />
            </label>
            <button type="button" className="inline-flex h-10 items-center justify-center gap-2 justify-self-start rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50" disabled={busy} onClick={onCreate}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t[RSC.PROJECT_USER_DIALOG_ADD_USER_BUTTON]}
            </button>
            {busy ? <p role="status" className="text-xs text-zinc-500">{t[RSC.PROJECT_USER_DIALOG_PENDING_STATUS]}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
