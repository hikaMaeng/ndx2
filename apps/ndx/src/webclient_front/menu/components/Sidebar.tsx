import type { ReactNode } from "react";
import { BookOpen, Settings, X } from "lucide-react";
import { type NDXAgentWebMetadataResponse } from "ndx/webclient/common";
import { LanguageButton } from "./LanguageButton";
import { RSC } from "../resource";

type SidebarProps = {
  children: ReactNode;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  t: Record<string, string>;
  onChangeLanguage: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
};

export function Sidebar({ children, metadata, t, onChangeLanguage, onClose, onOpenSettings }: SidebarProps) {
  const brandName = t[RSC.APP_BRAND_NAME_TEXT] || "NDX vibe";
  return (
    <aside className="flex h-full w-full shrink-0 overflow-hidden flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100" aria-label={t[RSC.MENU_SIDEBAR_NAVIGATION_LABEL]}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
        <div className="min-w-0">
          <a href="/" className="block truncate text-lg font-semibold leading-6">{brandName}</a>
          <p className="mt-1 text-xs text-zinc-500">v{metadata.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/docs" target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" aria-label="문서 새 탭에서 열기" title="문서">
            <BookOpen aria-hidden="true" className="h-4 w-4" />
          </a>
          <LanguageButton label={t[RSC.MENU_SIDEBAR_CHANGE_LANGUAGE_BUTTON]} onClick={onChangeLanguage} />
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 md:hidden" aria-label={t[RSC.MENU_SIDEBAR_CLOSE_BUTTON]} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-4" aria-label={t[RSC.MENU_SIDEBAR_NAVIGATION_LABEL]}>
        {children}
      </nav>

      <section className="grid gap-3 border-t border-zinc-800 px-4 py-4" aria-label={t[RSC.MENU_SIDEBAR_SETTINGS_TITLE]}>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" onClick={onOpenSettings}>
          <Settings aria-hidden="true" className="h-4 w-4" />
          {t[RSC.MENU_SIDEBAR_SETTINGS_TITLE]}
        </button>
      </section>
    </aside>
  );
}
