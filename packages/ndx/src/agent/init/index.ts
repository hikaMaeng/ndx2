import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResultRow } from "pg";
import type { NDXLogger } from "../../common/log/index.js";
import { initAccountDatabase } from "../account/index.js";
import { initSessionDatabase } from "../session/index.js";
import { initWebClientStateDatabase } from "../../webclient/server/client-state/index.js";
import { initChatDatabase } from "../chat/index.js";
import { initCompactDatabase } from "../compact/index.js";
import { copyDirectoryRecursively } from "../../common/file/index.js";
import { NDX_SYSTEM_SKILL_ASSETS, type NDXSystemSkillAsset } from "../tool/base/systemSkills.js";
import type { NDXDatabase } from "./database.js";

const DEFAULT_NDX_DATABASE_URL = "postgresql://ndev:ndev@127.0.0.1:5432/ndev";

export interface InitServerOptions {
  userHome: string;
  databaseUrl?: string;
  logger?: NDXLogger;
}

export interface InitializedServerResult {
  database: NDXDatabase;
  close(): Promise<void>;
}

export type { NDXDatabase } from "./database.js";

/** Seeds server-owned `.ndx` assets and initializes server database schemas. */
export async function initServer(options: InitServerOptions): Promise<InitializedServerResult> {
  options.logger?.info("agent.server.init.start", {
    hasDatabaseUrl: Boolean(options.databaseUrl)
  });
  const userHome = options.userHome;
  await seedServerAssets(userHome);

  const database = createNDXDatabase(options.databaseUrl, options.logger);
  try {
    await initAccountDatabase(database);
    await initSessionDatabase(database);
    await initChatDatabase(database);
    await initWebClientStateDatabase(database);
    await initCompactDatabase(database);
    options.logger?.info("agent.server.init.complete");
    return {
      database,
      async close() {
        options.logger?.info("agent.server.database.close.start");
        await database.close();
        options.logger?.info("agent.server.database.close.complete");
      }
    };
  } catch (error) {
    options.logger?.error("agent.server.init.failed", { error });
    await database.close();
    throw error;
  }
}

export async function seedServerAssets(userHome: string): Promise<void> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const primaryAssetsPath = path.join(moduleDirectory, "assets");
  const fallbackAssetsPath = path.join(moduleDirectory, "..", "..", "..", "..", "src", "agent", "init", "assets");
  const assetsRoot = fs.existsSync(primaryAssetsPath) ? primaryAssetsPath : fallbackAssetsPath;

  await copyDirectoryRecursively(assetsRoot, path.join(userHome, ".ndx"));

  for (const systemSkillAsset of NDX_SYSTEM_SKILL_ASSETS) {
    await copySystemSkillAsset(userHome, systemSkillAsset);
  }
}

async function copySystemSkillAsset(userHome: string, asset: NDXSystemSkillAsset): Promise<void> {
  const sourceDirectory = asset.sourceDirectories.find((candidate) => fs.existsSync(candidate));
  if (!sourceDirectory) {
    throw new Error(`Registered system skill asset is missing: ${asset.skillDirectoryName}`);
  }

  await copyDirectoryRecursively(
    sourceDirectory,
    path.join(userHome, ".ndx", "system", "skills", asset.skillDirectoryName),
    { overwriteExisting: true }
  );
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
