import { Globe2 } from "lucide-react";
import { Button } from "../../components/ui/button";

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
      variant="outline"
      size="sm"
      className="h-9 w-9 border-zinc-800 bg-zinc-900 p-0 text-zinc-300 hover:bg-zinc-800"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Globe2 aria-hidden="true" className="h-4 w-4" />
    </Button>
  );
}
