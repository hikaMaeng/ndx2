import React from "react";
import { Save } from "lucide-react";
import type { NDXAgentWebSelfcheckCandidate } from "ndx/webclient/common";
import { getSettingsSlice } from "ndx/webclient/front";
import { Button, Input } from "../components/ui";
import { useModel } from "../model/useModel";

export function useSettingsState<T>(key: string, initial: T): [T, (update: React.SetStateAction<T>) => void] {
  const slice = useModel(getSettingsSlice(key, initial));
  return [slice.value, (update) => slice.set(update)];
}

export function TextInput({ label, description, value, onChange, placeholder }: { label: string; description: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <span className="text-xs leading-5 text-zinc-500">{description}</span>
      <Input className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function NumberTextInput({ label, value, onChange, min }: { label: string; value: string; onChange: (value: string) => void; min?: number }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <Input type="number" min={min} step={1} className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SettingsSectionTitle({ title, description, pending }: { title: string; description: string; pending: string }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-3xl text-sm leading-6 text-zinc-400">{description}</p>
      {pending ? <StatusPill text="처리 중" tone="idle" /> : null}
    </section>
  );
}

export function SettingsFormShell({ title, description, pending, error, message, onSubmit, children }: { title: string; description: string; pending: string; error: string; message: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; children: React.ReactNode }) {
  return (
    <form className="mx-auto grid max-w-5xl gap-4" onSubmit={onSubmit}>
      <SettingsSectionTitle title={title} description={description} pending={pending} />
      <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
        {children}
        <div className="flex justify-end">
          <SaveButton disabled={Boolean(pending)} label="저장" />
        </div>
      </section>
      <SettingsFeedback error={error} message={message} />
    </form>
  );
}

export function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <Button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50" disabled={disabled}>
      <Save aria-hidden="true" className="h-4 w-4" />
      {label}
    </Button>
  );
}

export function SettingsFeedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error ? <p className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="rounded-md border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}
    </>
  );
}

export function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
      <summary className="cursor-pointer text-xs font-medium text-zinc-300">{title}</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-zinc-400">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export function SelfcheckSmallList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="grid gap-2">
        {rows.slice(0, 8).map((row, index) => (
          <p key={`${row}:${index}`} className="truncate rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400">{row}</p>
        ))}
        {rows.length === 0 ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-4 text-center text-xs text-zinc-500">없음</p> : null}
      </div>
    </section>
  );
}

export function SelfcheckCandidateList({ candidates }: { candidates: NDXAgentWebSelfcheckCandidate[] }) {
  return (
    <section className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/45 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">분석 후보</h3>
      <div className="grid gap-2">
        {candidates.slice(0, 8).map((candidate) => (
          <article key={candidate.candidateid} className="grid gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs">
            <div className="flex flex-wrap gap-1">
              <StatusPill text={candidate.status} tone={candidate.status === "pending" ? "warn" : "idle"} />
              <StatusPill text={`${candidate.subjectkind}/${candidate.subjectname}`} tone="idle" />
            </div>
            <p className="break-words font-mono text-zinc-300">{candidate.reason}</p>
          </article>
        ))}
        {candidates.length === 0 ? <p className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-4 text-center text-xs text-zinc-500">없음</p> : null}
      </div>
    </section>
  );
}

export function StatusPill({ text, tone }: { text: string; tone: "ok" | "idle" | "warn" }) {
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${tone === "ok" ? "border-emerald-700 bg-emerald-950/50 text-emerald-200" : tone === "warn" ? "border-amber-700 bg-amber-950/50 text-amber-200" : "border-zinc-700 bg-zinc-950 text-zinc-400"}`}>
      {text}
    </span>
  );
}

export function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs leading-5 text-zinc-400">{children}</p>;
}
