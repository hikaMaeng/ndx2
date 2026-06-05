import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, FileImage, FilePenLine, FileSearch, FileText, Globe, History, ListChecks, MessageCircleQuestion, Search, Terminal, TextCursorInput } from "lucide-react";
import type { NDXSidebarItem } from "ndx/common/protocol";
import { groupRightSidebarItems } from "ndx/webclient/front";
import type { TurnFlowState } from "ndx/webclient/front";

export function TurnSidebarCards({ items: explicitItems, turn }: { items?: NDXSidebarItem[]; turn?: TurnFlowState }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const items = explicitItems ?? [];
  if (items.length === 0) return null;
  const idPrefix = turn?.id ?? "session-sidebar";
  const groups = groupRightSidebarItems(items);

  return (
    <>
      {groups.map((group) => {
        const isOpen = openGroups[`${idPrefix}:${group.id}`] === true;
        const toggleLabel = `${group.title} ${isOpen ? "접기" : "펼치기"}`;
        const listId = `right-sidebar-card-${idPrefix.replace(/[^a-z0-9_-]/giu, "-")}-${group.id.replace(/[^a-z0-9_-]/giu, "-")}`;
        return (
          <section key={group.id} aria-label={group.title} className="h-auto min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3" data-testid="right-sidebar-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-zinc-100">{group.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">{group.items.length + group.subgroups.reduce((total, subgroup) => total + subgroup.items.length, 0)}개</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 p-0 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                  aria-label={toggleLabel}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() => setOpenGroups((current) => ({ ...current, [`${idPrefix}:${group.id}`]: !isOpen }))}
                >
                  {isOpen ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {isOpen ? (
              <div id={listId} className="mt-3 grid gap-3">
                {group.items.length > 0 ? <SidebarItemList items={group.items} /> : null}
                {group.subgroups.map((subgroup) => (
                  <div key={subgroup.id} className="grid min-w-0 gap-2" data-testid="right-sidebar-card-subgroup">
                    <h4 className="truncate text-xs font-semibold text-zinc-400">{subgroup.title}</h4>
                    <SidebarItemList items={subgroup.items} />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function SidebarItemList({ items }: { items: NDXSidebarItem[] }) {
  return (
    <ol className="grid gap-2">
      {items.map((item) => (
        <li key={item.key ?? `${item.group.id}:${item.subgroup?.id ?? ""}:${item.title}:${item.body ?? ""}`} className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2" data-testid="right-sidebar-card-item">
          <SidebarItemIcon item={item} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
            {item.body ? <p className="mt-1 truncate text-xs text-zinc-500">{item.body}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SidebarItemIcon({ item }: { item: NDXSidebarItem }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (item.kind === "skill") return <BookOpen aria-hidden="true" className={`${className} text-emerald-300`} />;
  if (item.kind === "write_file" || item.kind === "edit") return <FilePenLine aria-hidden="true" className={`${className} text-amber-300`} />;
  if (item.kind === "bash") return <Terminal aria-hidden="true" className={`${className} text-lime-300`} />;
  if (item.kind === "glob") return <FileSearch aria-hidden="true" className={`${className} text-blue-300`} />;
  if (item.kind === "grep_search") return <Search aria-hidden="true" className={`${className} text-blue-300`} />;
  if (item.kind === "get_image") return <FileImage aria-hidden="true" className={`${className} text-rose-300`} />;
  if (item.kind === "cot_work") return <ListChecks aria-hidden="true" className={`${className} text-teal-300`} />;
  if (item.kind === "web_fetch") return <Globe aria-hidden="true" className={`${className} text-cyan-300`} />;
  if (item.kind === "web_search") return <Search aria-hidden="true" className={`${className} text-cyan-300`} />;
  if (item.kind === "ask_user_question") return <MessageCircleQuestion aria-hidden="true" className={`${className} text-violet-300`} />;
  if (item.kind === "prompt_rewrite") return <TextCursorInput aria-hidden="true" className={`${className} text-fuchsia-300`} />;
  if (item.kind === "session_history") return <History aria-hidden="true" className={`${className} text-indigo-300`} />;
  if (item.kind === "file" || item.kind === "file_reference" || item.kind === "artifact") return <FileText aria-hidden="true" className={`${className} text-sky-300`} />;
  return <FileText aria-hidden="true" className={`${className} text-zinc-400`} />;
}
