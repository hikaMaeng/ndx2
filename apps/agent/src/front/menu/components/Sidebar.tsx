import type { ReactNode } from "react";
import { Settings, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { type NDXAgentWebMetadataResponse } from "ndx/agent/web";
import { LanguageButton } from "./LanguageButton";
import { RSC } from "../resource";

type SidebarProps = {
  children: ReactNode;
  metadata: Partial<NDXAgentWebMetadataResponse>;
  t: Record<string, string>;
  onChangeLanguage: () => void;
  onClose: () => void;
};

export function Sidebar({ children, metadata, t, onChangeLanguage, onClose }: SidebarProps) {
  const brandName = t[RSC.APP_BRAND_NAME_TEXT] || "NDX vibe";
  return (
    <aside className="flex h-full w-full shrink-0 overflow-hidden flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100" aria-label={t[RSC.MENU_SIDEBAR_NAVIGATION_LABEL]}>
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
        <div className="min-w-0">
          <a href="/" className="block truncate text-lg font-semibold leading-6">{brandName}</a>
          <p className="mt-1 text-xs text-zinc-500">v{metadata.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageButton label={t[RSC.MENU_SIDEBAR_CHANGE_LANGUAGE_BUTTON]} onClick={onChangeLanguage} />
          <Button type="button" variant="outline" size="sm" className="h-9 w-9 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800 md:hidden" aria-label={t[RSC.MENU_SIDEBAR_CLOSE_BUTTON]} onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-4" aria-label={t[RSC.MENU_SIDEBAR_NAVIGATION_LABEL]}>
        {children}
      </nav>

      <section className="grid gap-3 border-t border-zinc-800 px-4 py-4" aria-label={t[RSC.MENU_SIDEBAR_SETTINGS_TITLE]}>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
          <Settings aria-hidden="true" className="h-4 w-4" />
          {t[RSC.MENU_SIDEBAR_SETTINGS_TITLE]}
        </h2>
      </section>
    </aside>
  );
}
