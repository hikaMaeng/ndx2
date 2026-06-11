import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ExternalLink, Menu, Search, X } from "lucide-react";
import { documentAssetUrl } from "./assets";
import { documentPath, documentSections, findDocument } from "./catalog";

export function DocumentSite() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const locationPath = window.location.pathname.split("/").filter(Boolean);
  const sectionId = locationPath[1] ?? null;
  const documentId = locationPath[2] ?? null;
  const activeDocument = findDocument(sectionId, documentId);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSections = normalizedQuery
    ? documentSections
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => `${section.title} ${entry.title} ${entry.description}`.toLowerCase().includes(normalizedQuery))
      }))
      .filter((section) => section.entries.length > 0)
    : documentSections;

  return (
    <main className="flex h-dvh overflow-hidden bg-black text-zinc-100">
      <DocumentSidebar activeId={activeDocument.id} filteredSections={filteredSections} query={query} sidebarOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onQueryChange={setQuery} />
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-black px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-200 md:hidden" aria-label="문서 메뉴 열기" onClick={() => setSidebarOpen(true)}>
              <Menu aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-500">NDX Documents</p>
              <h1 className="truncate text-base font-semibold leading-6 text-zinc-50">{activeDocument.title}</h1>
            </div>
          </div>
          <a href="/" className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200 transition-colors hover:bg-zinc-900">
            앱으로 돌아가기
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </header>
        <article className="ndx-doc-markdown ndx-wrap-anywhere min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-10 lg:px-14">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img({ src = "", alt = "" }) {
                return <img src={documentAssetUrl(String(src))} alt={String(alt)} loading="lazy" />;
              }
            }}
          >
            {activeDocument.markdown}
          </ReactMarkdown>
        </article>
      </section>
    </main>
  );
}

type DocumentSidebarProps = {
  activeId: string;
  filteredSections: typeof documentSections;
  query: string;
  sidebarOpen: boolean;
  onClose: () => void;
  onQueryChange: (value: string) => void;
};

function DocumentSidebar({ activeId, filteredSections, query, sidebarOpen, onClose, onQueryChange }: DocumentSidebarProps) {
  return (
    <>
      {sidebarOpen ? <button type="button" aria-label="문서 메뉴 닫기" className="fixed inset-0 z-30 bg-black/70 md:hidden" onClick={onClose} /> : null}
      <aside className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-80 max-w-[86vw] flex-col border-r border-zinc-800 bg-black transition-transform md:static md:z-auto md:w-80 md:translate-x-0`} aria-label="문서 목차">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <a href="/docs" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-50">
            <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">NDX Docs</span>
          </a>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-200 md:hidden" aria-label="문서 메뉴 닫기" onClick={onClose}>
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <label className="mx-4 mt-4 flex h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-400">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600" placeholder="문서 검색" />
        </label>
        <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-label="문서 목록">
          <div className="grid gap-6">
            {filteredSections.map((section) => (
              <section key={section.id} className="grid gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">{section.title}</h2>
                <div className="grid gap-1">
                  {section.entries.map((entry) => (
                    <a key={entry.id} href={documentPath(section.id, entry.id)} aria-current={entry.id === activeId ? "page" : undefined} className={`grid gap-1 rounded-md px-3 py-2 text-left transition-colors ${entry.id === activeId ? "bg-zinc-900 text-zinc-50" : "text-zinc-300 hover:bg-zinc-950 hover:text-zinc-50"}`}>
                      <span className="text-sm font-medium">{entry.title}</span>
                      <span className="text-xs leading-5 text-zinc-500">{entry.description}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>
      </aside>
    </>
  );
}
