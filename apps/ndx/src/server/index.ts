import http from "node:http";
import { createNDXLogger } from "ndx/common";
import { initServer } from "ndx/agent";
import { NDX_CONTAINER_LOG_ROOT, NDX_CONTAINER_USER_HOME } from "ndx/common/server-path";
import { acquireAgentServerInstanceLock, attachSessionSocketServer } from "./agent/index.js";
import { createApp } from "./app.js";
import { readEnv } from "./env.js";
import { createAgentServerResourceResolver } from "./resource/index.js";

const env = readEnv();
const agentLogger = createNDXLogger({ surface: "agent", rootDir: NDX_CONTAINER_LOG_ROOT });
const webLogger = createNDXLogger({ surface: "web", rootDir: NDX_CONTAINER_LOG_ROOT });
const resource = createAgentServerResourceResolver();
agentLogger.info("agent.process.start", { port: env.port, sessionSocketPath: env.sessionSocketPath });
const initializedServer = await initServer({
  userHome: NDX_CONTAINER_USER_HOME,
  databaseUrl: env.databaseUrl,
  logger: agentLogger
});
const app = createApp({
  sessionSocketPath: env.sessionSocketPath,
  database: initializedServer.database,
  agentLogger,
  webLogger,
  resource
});
const releaseInstanceLock = acquireAgentServerInstanceLock();
const server = http.createServer(app);
const sessionSocketServer = attachSessionSocketServer(server, {
  database: initializedServer.database,
  path: env.sessionSocketPath,
  logger: agentLogger,
  resource
});
let shuttingDown = false;

try {
  await listenServer(server, env.port);
  agentLogger.info("agent.process.listen", { port: env.port });
} catch (error) {
  agentLogger.error("agent.process.listen_failed", { error });
  sessionSocketServer.close();
  server.close();
  releaseInstanceLock();
  await initializedServer.close();
  throw error;
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  agentLogger.info("agent.process.shutdown.start");
  sessionSocketServer.close();
  void closeServer(server)
    .finally(() => {
      releaseInstanceLock();
      return initializedServer.close();
    })
    .finally(() => {
      agentLogger.info("agent.process.shutdown.complete");
      process.exit(0);
    });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function listenServer(server: http.Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
