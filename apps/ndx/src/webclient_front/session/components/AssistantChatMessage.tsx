import React from "react";
import { Copy } from "lucide-react";
import { MarkdownMessage } from "./MarkdownMessage";
import { Button } from "../../components/ui";

export function AssistantChatMessage({ text, copyEnabled }: { text: string; copyEnabled: boolean }) {
  const [copyStatus, setCopyStatus] = React.useState("");

  return (
    <div className="group/assistant-message relative min-w-0">
      <div className={copyEnabled ? "prose prose-invert min-w-0 max-w-none overflow-hidden pr-8 prose-p:my-2 prose-headings:my-3 prose-headings:text-zinc-100 prose-strong:text-zinc-100" : "prose prose-invert min-w-0 max-w-none overflow-hidden prose-p:my-2 prose-headings:my-3 prose-headings:text-zinc-100 prose-strong:text-zinc-100"}>
        <MarkdownMessage text={text} />
      </div>
      {copyEnabled ? (
        <Button
          type="button"
          className="absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-md text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-zinc-100 focus:opacity-100 group-hover/assistant-message:opacity-100"
          aria-label="응답 텍스트 복사"
          title={copyStatus || "텍스트 복사"}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopyStatus("복사됨");
              window.setTimeout(() => setCopyStatus(""), 1200);
            });
          }}
        >
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
