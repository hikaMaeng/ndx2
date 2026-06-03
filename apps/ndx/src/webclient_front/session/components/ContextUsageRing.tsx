import type { NDXAgentWebContextUsage } from "ndx/webclient/front";
import { CONTEXT_USAGE_PART_RSC } from "../resource";

export function ContextUsageRing({ usage, label, title, t }: { usage?: NDXAgentWebContextUsage; label: string; title: string; t: Record<string, string> }) {
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, usage?.percent ?? 0));
  const usageSegments = [
    { start: 0, end: 35, className: "stroke-emerald-400" },
    { start: 35, end: 70, className: "stroke-yellow-400" },
    { start: 70, end: 100, className: "stroke-red-400" }
  ];
  const formatTokens = (value: number) => new Intl.NumberFormat().format(value);
  const parts = usage?.parts && usage.parts.length > 0
    ? usage.parts
    : [
        {
          key: "used" as const,
          label: "사용 중",
          tokens: usage?.tokens ?? 0,
          percent: clamped
        },
        {
          key: "remaining" as const,
          label: "남은 공간",
          tokens: Math.max(0, (usage?.contextsize ?? 0) - (usage?.tokens ?? 0)),
          percent: Math.max(0, Math.round((100 - clamped) * 100) / 100)
        }
      ];

  return (
    <div className="group relative inline-flex h-7 w-7 items-center justify-center">
      <button type="button" className="h-5 w-5" aria-label={label} aria-describedby="context-usage-popover">
        <svg viewBox="0 0 20 20" className="h-5 w-5 -rotate-90" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, index) => (
            <line key={index} x1="10" y1="1" x2="10" y2="3" className="stroke-zinc-600" strokeWidth="1" transform={`rotate(${index * 30} 10 10)`} />
          ))}
          <circle cx="10" cy="10" r={radius} className="fill-none stroke-zinc-800" strokeWidth="2" />
          {usageSegments.map((segment) => {
            const segmentPercent = Math.max(0, Math.min(clamped, segment.end) - segment.start);
            if (segmentPercent === 0) return null;
            return (
              <circle
                key={segment.start}
                cx="10"
                cy="10"
                r={radius}
                className={`fill-none ${segment.className}`}
                strokeDasharray={`${(segmentPercent / 100) * circumference} ${circumference}`}
                strokeDashoffset={-(segment.start / 100) * circumference}
                strokeLinecap="round"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </button>
      <div
        id="context-usage-popover"
        role="status"
        className="pointer-events-none absolute bottom-8 right-0 hidden w-80 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left shadow-xl group-hover:block group-focus-within:block"
      >
        <p className="text-xs font-medium text-zinc-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {formatTokens(usage?.tokens ?? 0)} / {formatTokens(usage?.contextsize ?? 0)} tokens ({clamped}%)
        </p>
        <div className="mt-3 grid gap-1.5 text-xs">
          {parts.map((part) => (
            <div key={part.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-zinc-400">
              <span className="truncate">{t[CONTEXT_USAGE_PART_RSC[part.key]] ?? part.label}</span>
              <span className="tabular-nums text-zinc-300">{formatTokens(part.tokens)}</span>
              <span className="w-12 text-right tabular-nums text-zinc-500">{part.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
