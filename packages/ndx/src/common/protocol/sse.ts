export function parseSSEDataFrame(frame: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const value = line.slice("data:".length);
    dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  return dataLines.length > 0 ? dataLines.join("\n") : undefined;
}
