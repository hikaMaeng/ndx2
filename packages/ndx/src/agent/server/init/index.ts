import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResultRow } from "pg";
import type { NDXLogger } from "../../../common/log/index.js";
import { serverContainerUserHome } from "../../../server/common/index.js";
import { initAccountDatabase } from "../account/index.js";
import { initProjectDatabase } from "../project/index.js";
import { initSessionDatabase } from "../session/index.js";
import { initSessionTokenDatabase } from "../session-token/index.js";
import { initWebClientStateDatabase } from "../../web/client-state/index.js";
import { copyDirectoryRecursively } from "../../../common/file/index.js";
import type { NDXDatabase } from "./database.js";

const USER_HOME_ASSET_PATHS = [["system", "modelprompt"]] as const;
const PROJECT_HOME_ASSET_PATHS: readonly string[][] = [] as const;
const DEFAULT_NDX_DATABASE_URL = "postgresql://ndev:ndev@pgvector:5432/ndev";

export interface InitServerOptions {
  userHome?: string;
  projectHome?: string;
  database?: NDXDatabase;
  databaseUrl?: string;
  databaseRequired?: boolean;
  logger?: NDXLogger;
}

export interface InitServerResult {
  database?: NDXDatabase;
  close(): Promise<void>;
}

export interface InitializedServerResult {
  database: NDXDatabase;
  close(): Promise<void>;
}

export type { NDXDatabase } from "./database.js";

/** Seeds server-owned `.ndx` assets and initializes server database schemas. */
export async function initServer(options: InitServerOptions & { databaseRequired: true }): Promise<InitializedServerResult>;
export async function initServer(options?: InitServerOptions): Promise<InitServerResult>;
export async function initServer(options: InitServerOptions = {}): Promise<InitServerResult> {
  options.logger?.info("agent.server.init.start", {
    hasDatabase: Boolean(options.database),
    databaseRequired: Boolean(options.databaseRequired)
  });
  const userHome = options.userHome ?? serverContainerUserHome();
  const projectHome = options.projectHome;

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const primaryAssetsPath = path.join(moduleDirectory, "assets");
  const fallbackAssetsPath = path.join(moduleDirectory, "..", "..", "..", "..", "src", "agent", "server", "init", "assets");
  let assetsRoot = fallbackAssetsPath;

  try {
    fs.accessSync(primaryAssetsPath);
    assetsRoot = primaryAssetsPath;
  } catch {
    assetsRoot = fallbackAssetsPath;
  }

  for (const relativePath of USER_HOME_ASSET_PATHS) {
    await copyDirectoryRecursively(
      path.join(assetsRoot, ...relativePath),
      path.join(userHome, ".ndx", ...relativePath)
    );
  }

  if (PROJECT_HOME_ASSET_PATHS.length > 0 && !projectHome) {
    throw new Error("projectHome is required for project-home init categories.");
  }

  if (projectHome) {
    for (const relativePath of PROJECT_HOME_ASSET_PATHS) {
      await copyDirectoryRecursively(
        path.join(assetsRoot, ...relativePath),
        path.join(projectHome, ...relativePath)
      );
    }
  }

  if (!options.database && !options.databaseUrl && !options.databaseRequired) {
    return {
      async close() {}
    };
  }

  const database = options.database ?? createNDXDatabase(options.databaseUrl, options.logger);
  if (options.database && options.logger && !database.logger) {
    database.logger = options.logger;
  }
  const ownsDatabase = !options.database;
  try {
    await initAccountDatabase(database);
    await initProjectDatabase(database);
    await initSessionDatabase(database);
    await initSessionTokenDatabase(database);
    await initWebClientStateDatabase(database);
    options.logger?.info("agent.server.init.complete", { ownsDatabase });
    return {
      database,
      async close() {
        if (ownsDatabase) {
          options.logger?.info("agent.server.database.close.start");
          await database.close();
          options.logger?.info("agent.server.database.close.complete");
        }
      }
    };
  } catch (error) {
    options.logger?.error("agent.server.init.failed", { error });
    if (ownsDatabase) {
      await database.close();
    }
    throw error;
  }
}

function createNDXDatabase(
  connectionString = process.env.NDX_DATABASE_URL ?? DEFAULT_NDX_DATABASE_URL,
  logger?: NDXLogger
): NDXDatabase {
  const pool = new Pool({ connectionString });

  return {
    logger,
    query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
      logger?.debug("agent.server.database.query", {
        operation: text.trim().split(/\s+/u).slice(0, 4).join(" "),
        values: values?.length ?? 0
      });
      return pool.query<Row>(text, values);
    },
    close() {
      return pool.end();
    }
  };
}
