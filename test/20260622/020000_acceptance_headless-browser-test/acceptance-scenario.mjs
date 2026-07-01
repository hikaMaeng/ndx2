import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.NDX_ACCEPTANCE_URL ?? "http://127.0.0.1:18080";
const outDir = process.env.NDX_ACCEPTANCE_OUT ?? "test/20260622/020000_acceptance_headless-browser-test";
const screenshotDir = path.join(outDir, "screenshots");
const tracePath = path.resolve(outDir, "trace.zip");
const reportJsonPath = path.resolve(outDir, "report.json");
const reportMdPath = path.resolve(outDir, "report.md");
const now = new Date().toISOString().replace(/[:.]/g, "-");
const testPrompt = `인수테스트 세션 ${now}`;

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const steps = [];
const screenshots = [];
let createdSession;
let pinnedSession;
let finalUrl = "";
let documentStatus = 0;

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

async function step(name, run) {
  try {
    const value = await run();
    steps.push({ name, status: "passed" });
    return value;
  } catch (error) {
    steps.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
    await screenshot(`failure-${steps.length}-${name.replace(/[^a-z0-9가-힣_-]+/giu, "-").slice(0, 64)}`);
    throw error;
  }
}

async function screenshot(name) {
  const filePath = path.resolve(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath });
  screenshots.push(filePath);
}

async function api(pathname, init) {
  const { data, ...requestInit } = init ?? {};
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...requestInit,
    body: data ?? requestInit.body
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return { status: response.status, body };
}

try {
  await step("health endpoints respond", async () => {
    const health = await api("/health");
    const sessionHealth = await api("/api/session/health");
    if (health.body.status !== "ok" || sessionHealth.body.status !== "ok") {
      throw new Error("health endpoints did not return ok");
    }
  });

  await step("open home shell", async () => {
    const response = await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    documentStatus = response?.status() ?? 0;
    finalUrl = page.url();
    await page.getByRole("main").waitFor({ timeout: 15_000 });
    await page.getByRole("heading", { name: /프로젝트|projects/iu }).first().waitFor({ timeout: 15_000 });
    await page.getByRole("heading", { name: /채팅|chat/iu }).first().waitFor({ timeout: 15_000 });
    await screenshot("01-home-project-chat-shell");
  });

  await step("metadata and project list API", async () => {
    const metadata = await api("/api/agent");
    const projects = await api("/api/agent/web-projects");
    if (metadata.body.service !== "agent") throw new Error("metadata service is not agent");
    if (!Array.isArray(projects.body.projects) || projects.body.projects.length === 0) {
      throw new Error("expected at least one configured project");
    }
  });

  await step("create acceptance session through project API", async () => {
    const projects = await api("/api/agent/web-projects");
    const project = projects.body.projects.find((item) => item.projectName === "test1") ?? projects.body.projects[0];
    createdSession = await api(`/api/agent/projects/${encodeURIComponent(project.projectName)}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ title: testPrompt, mode: "none" })
    });
    if (!createdSession.body.sessionid) throw new Error("created session has no id");
  });

  await step("open created session from sidebar", async () => {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    const createdSessionButton = page.getByRole("button", { name: createdSession.body.sessionid });
    await createdSessionButton.waitFor({ timeout: 15_000 });
    await createdSessionButton.dispatchEvent("click");
    await page.getByRole("heading", { name: createdSession.body.sessionid }).waitFor({ timeout: 15_000 });
    await page.getByRole("form").waitFor({ timeout: 15_000 });
    await screenshot("02-created-session-open");
  });

  await step("session data restore API is empty but valid", async () => {
    const sessionData = await api(`/api/agent/sessions/${encodeURIComponent(createdSession.body.sessionid)}/data`);
    if (!Array.isArray(sessionData.body.data)) throw new Error("session data response has no data array");
  });

  await step("pin session and show pinned area", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        pinnedSession = await api(`/api/agent/sessions/${encodeURIComponent(createdSession.body.sessionid)}/favorite`, { method: "PUT" });
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        await page.waitForTimeout(500);
      }
    }
    if (pinnedSession.body.sessionid !== createdSession.body.sessionid) throw new Error("pinned session id mismatch");
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByText(/고정된 세션|PINNED SESSIONS/u).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: createdSession.body.sessionid }).first().waitFor({ timeout: 15_000 });
    await screenshot("03-pinned-session-visible");
  });

  await step("unpin session removes favorite API row", async () => {
    await api(`/api/agent/sessions/${encodeURIComponent(createdSession.body.sessionid)}/favorite`, { method: "DELETE" });
    const favorites = await api("/api/agent/session-favorites");
    const stillPinned = favorites.body.sessions.some((item) => item.sessionid === createdSession.body.sessionid);
    if (stillPinned) throw new Error("session remained in favorites after delete");
  });

  await step("settings tabs render", async () => {
    const settingsButton = page.getByRole("button", { name: /설정|Settings/u }).first();
    await settingsButton.waitFor({ timeout: 15_000 });
    await settingsButton.dispatchEvent("click");
    await page.getByText(/settings\.json 항목별 설정|Settings/u).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /런타임|Runtime/u }).first().dispatchEvent("click");
    await page.getByRole("heading", { name: /런타임 설정|Runtime/u }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: /자체 점검|Selfcheck/u }).first().dispatchEvent("click");
    await page.getByRole("heading", { name: /자체 점검 설정|Selfcheck settings/u }).waitFor({ timeout: 15_000 });
    await screenshot("04-settings-selfcheck-tab");
  });

  await step("selfcheck APIs respond", async () => {
    const [selfchecks, candidates, cursors, runs] = await Promise.all([
      api("/api/agent/selfcheck"),
      api("/api/agent/selfcheck/candidates"),
      api("/api/agent/selfcheck/cursors"),
      api("/api/agent/selfcheck/runs")
    ]);
    if (!Array.isArray(selfchecks.body.selfchecks)) throw new Error("selfcheck list missing");
    if (!Array.isArray(candidates.body.candidates)) throw new Error("selfcheck candidates missing");
    if (!Array.isArray(cursors.body.cursors)) throw new Error("selfcheck cursors missing");
    if (!Array.isArray(runs.body.runs)) throw new Error("selfcheck runs missing");
  });

  await step("docs surface renders", async () => {
    const docs = await page.goto(`${baseUrl}/docs`, { waitUntil: "domcontentloaded" });
    if ((docs?.status() ?? 0) >= 400) throw new Error(`docs returned ${docs?.status()}`);
    await page.getByRole("main").waitFor({ timeout: 15_000 });
    await screenshot("05-docs-surface");
  });

  await step("mobile layout menu opens", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    const openMenu = page.getByRole("button", { name: /메뉴 열기|Open menu/u });
    if (await openMenu.isVisible().catch(() => false)) {
      await openMenu.click();
    }
    await page.getByRole("heading", { name: /프로젝트|projects/iu }).first().waitFor({ timeout: 15_000 });
    await screenshot("06-mobile-menu-project-list");
  });

  await context.tracing.stop({ path: tracePath });
  await browser.close();

  const report = {
    status: "passed",
    mode: "scenario",
    testedUrl: baseUrl,
    finalUrl,
    documentStatus,
    title: "NDX vibe",
    createdSessionId: createdSession?.body?.sessionid,
    requestedSessionTitle: testPrompt,
    trace: tracePath,
    screenshots,
    consoleErrors,
    pageErrors,
    steps
  };
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportMdPath, [
    "# Headless Browser Acceptance Test",
    "",
    "- status: passed",
    "- mode: scenario",
    `- testedUrl: ${baseUrl}`,
    `- finalUrl: ${finalUrl}`,
    `- documentStatus: ${documentStatus}`,
    "- title: NDX vibe",
    `- createdSessionId: ${createdSession?.body?.sessionid ?? ""}`,
    `- requestedSessionTitle: ${testPrompt}`,
    `- trace: ${tracePath}`,
    `- screenshots: ${screenshots.length}`,
    `- consoleErrors: ${consoleErrors.length}`,
    `- pageErrors: ${pageErrors.length}`,
    "",
    "## Screenshots",
    ...screenshots.map((item) => `- ${item}`),
    "",
    "## Step Results",
    ...steps.map((item, index) => `- ${index + 1}. ${item.name}: ${item.status}${item.error ? ` - ${item.error}` : ""}`),
    "",
    "## Browser Errors",
    ...consoleErrors.map((item) => `- console: ${item}`),
    ...pageErrors.map((item) => `- page: ${item}`)
  ].join("\n"));
} catch (error) {
  try {
    await context.tracing.stop({ path: tracePath });
  } catch {}
  await browser.close().catch(() => undefined);
  const report = {
    status: "failed",
    mode: "scenario",
    testedUrl: baseUrl,
    finalUrl: page.url(),
    documentStatus,
    trace: tracePath,
    screenshots,
    consoleErrors,
    pageErrors,
    steps,
    error: error instanceof Error ? error.message : String(error)
  };
  await fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(reportMdPath, [
    "# Headless Browser Acceptance Test",
    "",
    "- status: failed",
    "- mode: scenario",
    `- testedUrl: ${baseUrl}`,
    `- finalUrl: ${page.url()}`,
    `- documentStatus: ${documentStatus}`,
    `- trace: ${tracePath}`,
    `- screenshots: ${screenshots.length}`,
    `- consoleErrors: ${consoleErrors.length}`,
    `- pageErrors: ${pageErrors.length}`,
    "",
    "## Screenshots",
    ...screenshots.map((item) => `- ${item}`),
    "",
    "## Step Results",
    ...steps.map((item, index) => `- ${index + 1}. ${item.name}: ${item.status}${item.error ? ` - ${item.error}` : ""}`),
    "",
    "## Failure",
    error instanceof Error ? error.stack ?? error.message : String(error),
    "",
    "## Browser Errors",
    ...consoleErrors.map((item) => `- console: ${item}`),
    ...pageErrors.map((item) => `- page: ${item}`)
  ].join("\n"));
  throw error;
}
