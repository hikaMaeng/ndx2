import { AlertTriangle, X } from "lucide-react";
import { RSC } from "../../../app/resource";
import { Button } from "../../../components/ui";

type ProjectWarningDialogProps = {
  title: string;
  message: string;
  t: Record<string, string>;
  onClose: () => void;
};

export function ProjectWarningDialog({ title, message, t, onClose }: ProjectWarningDialogProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4">
      <section role="alertdialog" aria-modal="true" className="grid w-full max-w-md gap-4 rounded-lg border border-amber-900/70 bg-zinc-950 p-5 shadow-2xl" aria-labelledby="project-warning-title" aria-describedby="project-warning-description">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-amber-800 bg-amber-950/50 text-amber-300">
              <AlertTriangle aria-hidden="true" className="h-5 w-5" />
            </span>
            <h2 id="project-warning-title" className="text-base font-semibold text-zinc-100">{title || t[RSC.APP_PROJECT_WARNING_TITLE_TEXT]}</h2>
          </div>
          <Button type="button" size={null} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label={t[RSC.APP_PROJECT_WARNING_CLOSE_BUTTON]} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
        <p id="project-warning-description" className="text-sm leading-6 text-zinc-300">{message}</p>
        <div className="flex justify-end">
          <Button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" onClick={onClose}>{t[RSC.APP_PROJECT_WARNING_CONFIRM_BUTTON]}</Button>
        </div>
      </section>
    </div>
  );
}
