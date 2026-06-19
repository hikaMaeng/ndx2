import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/usr/local/lib/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const outDir = path.join(root, "test", "20260619", `${stamp}_headless-browser-test`);
const screenshotDir = path.join(outDir, "screenshots");
await fs.mkdir(screenshotDir, { recursive: true });

const testedUrl = "http://127.0.0.1:18080";
const consoleErrors = [];
const pageErrors = [];
const screenshots = [];
const steps = [];
const trace = path.join(outDir, "trace.zip");

function record(action, status, error) {
  steps.push({ action, status, ...(error ? { error } : {}) });
}

async function shot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.NDX_HEADLESS_BROWSER_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

let status = "passed";
let documentStatus = null;
let errorMessage = "";
try {
  const response = await page.goto(testedUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  documentStatus = response?.status() ?? null;
  await page.getByRole("main").first().waitFor({ state: "visible", timeout: 15_000 });
  record("goto", "passed");
  await shot(page, "01-home");

  const settingsButton = page.getByRole("button", { name: "설정" });
  await settingsButton.waitFor({ state: "visible", timeout: 10_000 });
  await settingsButton.evaluate((element) => element.click());
  await page.getByRole("heading", { name: "설정", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  record("open settings", "passed");

  const selfcheckTab = page.getByRole("button", { name: "자체 점검" });
  await selfcheckTab.waitFor({ state: "visible", timeout: 10_000 });
  await selfcheckTab.evaluate((element) => element.click());
  await page.getByText("자체 점검 설정").waitFor({ state: "visible", timeout: 10_000 });
  await page.getByText("처리 중").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.includes("LLM 분석") && !button.disabled), undefined, { timeout: 30_000 });
  await shot(page, "02-selfcheck-ready");
  record("open selfcheck", "passed");

  await page.getByRole("button", { name: "LLM 분석" }).evaluate((element) => element.click());
  await page.getByText("분석 모델 키를 저장한 뒤 LLM 분석을 실행하세요.").waitFor({ state: "visible", timeout: 10_000 });
  await shot(page, "03-model-required");
  record("model validation", "passed");

  const runResponse = page.waitForResponse((response) => response.url().includes("/api/agent/selfcheck/run") && response.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "후보 추출" }).evaluate((element) => element.click());
  const completed = await runResponse;
  if (!completed.ok()) throw new Error(`candidate extract failed with HTTP ${completed.status()}`);
  await page.getByText("tool_result_empty_grep_matches").waitFor({ state: "visible", timeout: 20_000 });
  await shot(page, "04-candidate-extracted");
  record("candidate extraction", "passed");
} catch (error) {
  status = "failed";
  errorMessage = error instanceof Error ? error.message : String(error);
  record("scenario", "failed", errorMessage);
  await shot(page, "failure");
}

const finalUrl = page.url();
const title = await page.title().catch(() => "");
const mainPresent = await page.getByRole("main").count().then((count) => count > 0).catch(() => false);
await context.tracing.stop({ path: trace }).catch(() => undefined);
await browser.close();

const report = {
  status,
  mode: "scenario",
  testedUrl,
  finalUrl,
  documentStatus,
  title,
  mainPresent,
  consoleErrors,
  pageErrors,
  screenshots,
  trace,
  steps,
  ...(errorMessage ? { error: errorMessage } : {})
};
await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(outDir, "report.md"), `${[
  "# Headless Browser Test",
  "",
  `- status: ${status}`,
  "- mode: scenario",
  `- testedUrl: ${testedUrl}`,
  `- finalUrl: ${finalUrl}`,
  `- documentStatus: ${documentStatus ?? "unknown"}`,
  `- title: ${title || "(empty)"}`,
  `- mainPresent: ${mainPresent}`,
  `- consoleErrors: ${consoleErrors.length}`,
  `- pageErrors: ${pageErrors.length}`,
  `- trace: ${trace}`,
  `- screenshots: ${screenshots.length}`,
  "",
  "## Screenshots",
  ...screenshots.map((file) => `- ${file}`),
  "",
  "## Step Results",
  ...steps.map((step, index) => `- ${index + 1}. ${step.action}: ${step.status}${step.error ? ` - ${step.error}` : ""}`),
  "",
  "## Browser Errors",
  ...consoleErrors.map((error) => `- console: ${error}`),
  ...pageErrors.map((error) => `- page: ${error}`)
].join("\n")}\n`, "utf8");

console.log(`headless-browser-test status=${status}`);
console.log("mode=scenario");
console.log(`report=${path.join(outDir, "report.md")}`);
for (const file of screenshots) console.log(`screenshot=${file}`);
process.exit(status === "passed" ? 0 : 1);
