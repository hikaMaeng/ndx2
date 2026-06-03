export function ProtocolStep({ active, label, value }: { active: boolean; label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-3">
      <p className={active ? "text-xs font-medium text-emerald-400" : "text-xs font-medium text-zinc-500"}>{label}</p>
      <p className="mt-2 break-all text-sm text-zinc-300">{value}</p>
    </div>
  );
}
