export function normalizeModalities(current: Array<"text" | "image" | "file">): Array<"text" | "image" | "file"> {
  return Array.from(new Set<"text" | "image" | "file">(["text", ...current]));
}

export function toggleModality(current: Array<"text" | "image" | "file">, modality: "image" | "file", checked: boolean): Array<"text" | "image" | "file"> {
  const next = new Set<"text" | "image" | "file">(normalizeModalities(current));
  if (checked) {
    next.add(modality);
  } else {
    next.delete(modality);
  }
  return [...next];
}

export function optionalNumber<Key extends string>(key: Key, value: string): Partial<Record<Key, number>> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const number = Number(trimmed);
  return Number.isFinite(number) ? ({ [key]: number } as Partial<Record<Key, number>>) : {};
}

export function optionalNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function optionalNumberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
