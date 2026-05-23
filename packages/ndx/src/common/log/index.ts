import fs from "node:fs";
import path from "node:path";

export type NDXLogLevel = "debug" | "info" | "warn" | "error";

export type NDXLogContext = Record<string, unknown>;

export type NDXLogger = {
  debug(event: string, context?: NDXLogContext): void;
  info(event: string, context?: NDXLogContext): void;
  warn(event: string, context?: NDXLogContext): void;
  error(event: string, context?: NDXLogContext): void;
};

export type CreateNDXLoggerOptions = {
  surface: string;
  rootDir?: string;
  console?: Pick<typeof console, "log" | "error">;
  clock?: () => Date;
};

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createNDXLogger(options: CreateNDXLoggerOptions): NDXLogger {
  const rootDir = options.rootDir ?? process.env.NDX_LOG_ROOT ?? path.resolve(process.cwd(), "log");
  const consoleWriter = options.console ?? console;
  const clock = options.clock ?? (() => new Date());

  return {
    debug(event, context) {
      writeLog("debug", options.surface, event, context, rootDir, consoleWriter, clock());
    },
    info(event, context) {
      writeLog("info", options.surface, event, context, rootDir, consoleWriter, clock());
    },
    warn(event, context) {
      writeLog("warn", options.surface, event, context, rootDir, consoleWriter, clock());
    },
    error(event, context) {
      writeLog("error", options.surface, event, context, rootDir, consoleWriter, clock());
    }
  };
}

function writeLog(
  level: NDXLogLevel,
  surface: string,
  event: string,
  context: NDXLogContext | undefined,
  rootDir: string,
  consoleWriter: Pick<typeof console, "log" | "error">,
  now: Date
) {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const line =
    JSON.stringify({
      time: now.toISOString(),
      level,
      surface,
      event,
      pid: process.pid,
      ...(context ? { context: normalizeLogValue(context) } : {})
    }) + "\n";

  const sessionid = typeof context?.sessionid === "string" && SESSION_ID_PATTERN.test(context.sessionid) ? context.sessionid : undefined;
  const filePath = sessionid ? path.join(rootDir, "session", sessionid, `${yyyy}${mm}${dd}.log`) : path.join(rootDir, surface, yyyy, mm, `${dd}.log`);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line, "utf8");
  } catch (error) {
    const fallback = JSON.stringify({
      time: now.toISOString(),
      level: "error",
      surface,
      event: "log.write_failed",
      pid: process.pid,
      context: normalizeLogValue({ filePath, error })
    });
    consoleWriter.error(fallback);
  }

  if (level === "error" || level === "warn") {
    consoleWriter.error(line.trimEnd());
  } else {
    consoleWriter.log(line.trimEnd());
  }
}

function normalizeLogValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeLogValue);
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|password|authorization|secret/i.test(key)) {
        output[key] = item ? "[redacted]" : item;
      } else {
        output[key] = normalizeLogValue(item);
      }
    }
    return output;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}
