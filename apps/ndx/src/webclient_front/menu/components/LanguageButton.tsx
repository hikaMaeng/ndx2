import { Globe2 } from "lucide-react";

export function LanguageButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Globe2 aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
