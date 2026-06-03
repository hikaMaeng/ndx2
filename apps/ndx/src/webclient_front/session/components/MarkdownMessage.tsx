import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="ndx-wrap-anywhere">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} className="text-emerald-300 underline underline-offset-2" target="_blank" rel="noreferrer" />,
          code: (props) => <code {...props} className="rounded bg-black/40 px-1 py-0.5 text-[0.92em] text-zinc-100" />,
          pre: (props) => <pre {...props} className="rounded-md border border-zinc-800 bg-black/40 p-3 text-xs leading-5 text-zinc-100" />,
          ul: (props) => <ul {...props} className="my-2 list-disc space-y-1 pl-5" />,
          ol: (props) => <ol {...props} className="my-2 list-decimal space-y-1 pl-5" />,
          blockquote: (props) => <blockquote {...props} className="my-2 border-l-2 border-zinc-700 pl-3 text-zinc-400" />,
          table: (props) => <table {...props} className="my-2 w-full border-collapse text-left text-xs" />,
          th: (props) => <th {...props} className="border border-zinc-800 px-2 py-1 font-semibold text-zinc-200" />,
          td: (props) => <td {...props} className="border border-zinc-800 px-2 py-1 text-zinc-300" />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
