import { Globe2 } from "lucide-react";
import { Button } from "../../components/ui";

export function LanguageButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size={null}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 p-0 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Globe2 aria-hidden="true" className="h-3.5 w-3.5" />
    </Button>
  );
}
