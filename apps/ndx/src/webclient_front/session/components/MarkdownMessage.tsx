import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ text, tone = "assistant" }: { text: string; tone?: "assistant" | "user" }) {
  const userTone = tone === "user";
  return (
    <div className="ndx-wrap-anywhere min-w-0 overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} className={userTone ? "text-blue-700 underline underline-offset-2" : "text-emerald-300 underline underline-offset-2"} target="_blank" rel="noreferrer" />,
          p: (props) => <p {...props} className="my-2 first:mt-0 last:mb-0" />,
          h1: (props) => <h1 {...props} className={userTone ? "my-3 text-lg font-semibold text-zinc-950 first:mt-0" : "my-3 text-lg font-semibold text-zinc-100 first:mt-0"} />,
          h2: (props) => <h2 {...props} className={userTone ? "my-3 text-base font-semibold text-zinc-950 first:mt-0" : "my-3 text-base font-semibold text-zinc-100 first:mt-0"} />,
          h3: (props) => <h3 {...props} className={userTone ? "my-2 text-sm font-semibold text-zinc-950 first:mt-0" : "my-2 text-sm font-semibold text-zinc-100 first:mt-0"} />,
          code: (props) => <code {...props} className={userTone ? "rounded bg-zinc-200 px-1 py-0.5 text-[0.92em] text-zinc-950" : "rounded bg-black/40 px-1 py-0.5 text-[0.92em] text-zinc-100"} />,
          pre: (props) => <pre {...props} className={userTone ? "my-2 max-w-full overflow-x-hidden rounded-md border border-zinc-300 bg-zinc-50 p-3 text-xs leading-5 text-zinc-950" : "my-2 max-w-full overflow-x-hidden rounded-md border border-zinc-800 bg-black/40 p-3 text-xs leading-5 text-zinc-100"} />,
          ul: (props) => <ul {...props} className="my-2 list-disc space-y-1 pl-5" />,
          ol: (props) => <ol {...props} className="my-2 list-decimal space-y-1 pl-5" />,
          blockquote: (props) => <blockquote {...props} className={userTone ? "my-2 border-l-2 border-zinc-300 pl-3 text-zinc-700" : "my-2 border-l-2 border-zinc-700 pl-3 text-zinc-400"} />,
          table: (props) => <table {...props} className="my-2 w-full min-w-0 border-collapse text-left text-xs" />,
          th: (props) => <th {...props} className={userTone ? "border border-zinc-300 px-2 py-1 font-semibold text-zinc-950" : "border border-zinc-800 px-2 py-1 font-semibold text-zinc-200"} />,
          td: (props) => <td {...props} className={userTone ? "border border-zinc-300 px-2 py-1 text-zinc-800" : "border border-zinc-800 px-2 py-1 text-zinc-300"} />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
