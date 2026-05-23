import { useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, FilePenLine, FileText, Loader2, XCircle } from "lucide-react";
import type { NDXSidebarItem } from "ndx/agent/common/protocol";
import { Button } from "../../components/ui/button";
import type { TurnFlowState } from "./types";

export function TurnSidebarCards({ turn }: { turn?: TurnFlowState }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  if (!turn || turn.sidebarItems.length === 0) return null;
  const StatusIcon = turn.status === "running" ? Loader2 : turn.status === "completed" ? CheckCircle2 : XCircle;
  const groups = turn.sidebarItems.reduce<Array<{ id: string; title: string; items: NDXSidebarItem[] }>>((nextGroups, item) => {
    const group = nextGroups.find((candidate) => candidate.id === item.group.id);
    if (group) {
      group.items.push(item);
    } else {
      nextGroups.push({ id: item.group.id, title: item.group.title, items: [item] });
    }
    return nextGroups;
  }, []);

  return (
    <>
      {groups.map((group) => {
        const isOpen = openGroups[`${turn.id}:${group.id}`] === true;
        const toggleLabel = `${group.title} ${isOpen ? "접기" : "펼치기"}`;
        const listId = `right-sidebar-card-${turn.id.replace(/[^a-z0-9_-]/giu, "-")}-${group.id.replace(/[^a-z0-9_-]/giu, "-")}`;
        return (
          <section key={group.id} aria-label={group.title} className="h-auto min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3" data-testid="right-sidebar-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-zinc-100">{group.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">{group.items.length}개</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusIcon aria-hidden="true" className={`h-4 w-4 ${turn.status === "running" ? "animate-spin text-sky-300" : turn.status === "completed" ? "text-emerald-300" : "text-rose-300"}`} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 border-zinc-800 bg-zinc-950 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label={toggleLabel}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() => setOpenGroups((current) => ({ ...current, [`${turn.id}:${group.id}`]: !isOpen }))}
                >
                  {isOpen ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {isOpen ? (
              <ol id={listId} className="mt-3 grid gap-2">
                {group.items.map((item) => (
                  <li key={item.key ?? `${item.group.id}:${item.title}:${item.body ?? ""}`} className="flex min-w-0 items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2" data-testid="right-sidebar-card-item">
                    <SidebarItemIcon item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">{item.title}</p>
                      {item.body ? <p className="mt-1 truncate text-xs text-zinc-500">{item.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function SidebarItemIcon({ item }: { item: NDXSidebarItem }) {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (item.kind === "skill") return <BookOpen aria-hidden="true" className={`${className} text-emerald-300`} />;
  if (item.kind === "write_file" || item.kind === "edit") return <FilePenLine aria-hidden="true" className={`${className} text-amber-300`} />;
  if (item.kind === "file" || item.kind === "file_reference" || item.kind === "artifact") return <FileText aria-hidden="true" className={`${className} text-sky-300`} />;
  return <FileText aria-hidden="true" className={`${className} text-zinc-400`} />;
}
