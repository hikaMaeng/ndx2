#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import net from "node:net";

const stateDir = join(homedir(), ".ndx2");
const statePath = join(stateDir, "npm-install.json");
const composePath = join(stateDir, "docker-compose.yml");
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
const templatePath = join(packageRoot, "templates", "docker-compose.yml");

const command = process.argv[2] ?? "start";

if (command === "--version" || command === "-v" || command === "version") {
  console.log(version);
  process.exit(0);
}

if (command === "--help" || command === "-h" || command === "help") {
  console.log(`ndx2 ${version}

Usage:
  ndx2              Initialize if needed, then start Docker containers.
  ndx2 start        Same as ndx2.
  ndx2 uninstall    Remove the npm initialization flag and ndx2 Docker stack.
`);
  process.exit(0);
}

if (command === "uninstall") {
  uninstall();
  process.exit(0);
}

if (command !== "start") {
  console.error(`Unknown command: ${command}`);
  console.error("Run `ndx2 --help` for usage.");
  process.exit(1);
}

await start();

async function start() {
  ensureDockerReady();

  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    runCompose(["up", "-d"]);
    printReady(state);
    return;
  }

  const selectedRoot = await askNdxRoot();
  const ndxRoot = resolve(selectedRoot);
  const agentPort = await findPort(18082);

  mkdirSync(join(ndxRoot, "pgvector"), { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  const compose = readFileSync(templatePath, "utf8")
    .replaceAll("__IMAGE_TAG__", version)
    .replaceAll("__NDX_ROOT__", dockerPath(ndxRoot))
    .replaceAll("__AGENT_WEB_HOST_PORT__", String(agentPort));

  writeFileSync(composePath, compose);
  const state = {
    initializedAt: new Date().toISOString(),
    version,
    ndxRoot,
    agentPort,
    composePath
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  runCompose(["up", "-d"]);
  printReady(state);
}

async function askNdxRoot() {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`ndx root volume path [${process.cwd()}]: `);
    return answer.trim() === "" ? process.cwd() : answer.trim();
  } finally {
    rl.close();
  }
}

function ensureDockerReady() {
  const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (docker.status !== 0) {
    console.error("ndx2 runs only in a Docker-capable environment. Install Docker and try again.");
    process.exit(1);
  }

  const info = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (info.status !== 0) {
    console.error("Docker is installed, but the Docker daemon is not available. Start Docker and try again.");
    process.exit(1);
  }

  const compose = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (compose.status !== 0) {
    console.error("ndx2 requires Docker Compose v2 (`docker compose`). Install or enable it and try again.");
    process.exit(1);
  }
}

function runCompose(args) {
  execFileSync("docker", ["compose", "-f", composePath, ...args], { stdio: "inherit" });
}

function uninstall() {
  if (existsSync(composePath)) {
    const docker = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
    if (docker.status === 0) {
      runCompose(["down", "--remove-orphans"]);
    } else {
      console.error("Docker Compose is not available, so only local ndx2 npm state will be removed.");
    }
  } else {
    console.log("No ndx2 npm compose file was found.");
  }

  rmSync(statePath, { force: true });
  rmSync(composePath, { force: true });
  console.log("ndx2 npm initialization state and Docker stack have been removed.");
}

function printReady(state) {
  console.log("");
  console.log("ndx2 is running.");
  console.log(`Agent: http://localhost:${state.agentPort}`);
  console.log(`Root volume: ${state.ndxRoot}`);
}

function dockerPath(path) {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

async function findPort(startAt) {
  for (let port = startAt; port <= 18999; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error("No free ndx2 host port found in 18081-18999.");
}

function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.once("error", () => resolvePort(false));
    server.once("listening", () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
