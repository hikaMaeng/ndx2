export type ServerEnv = {
  port: number;
  sessionSocketPath: string;
  nodeEnv: "development" | "test" | "production";
  databaseUrl?: string;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsedPort = readPort("PORT", source.PORT);

  const nodeEnv = source.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  return {
    port: parsedPort,
    sessionSocketPath: source.SESSION_SOCKET_PATH ?? "/session",
    nodeEnv,
    databaseUrl: source.NDX_DATABASE_URL
  };
}

function readPort(name: string, rawValue: string | undefined, defaultValue?: number): number {
  const parsedPort = Number(rawValue ?? defaultValue);

  if (!Number.isInteger(parsedPort) || parsedPort < 10000 || parsedPort > 59999) {
    throw new Error(`${name} must be an integer from 10000 to 59999`);
  }

  return parsedPort;
}
