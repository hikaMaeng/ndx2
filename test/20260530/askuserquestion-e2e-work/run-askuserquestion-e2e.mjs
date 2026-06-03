import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import playwright from "/usr/local/lib/node_modules/playwright/index.js";

const { chromium } = playwright;

const root = "/work";
const stamp = new Date();
const pad = (value) => String(value).padStart(2, "0");
const outDir = path.join(
  root,
  "test",
  `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}`,
  `${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}_askuserquestion-e2e`
);
const screenshotDir = path.join(outDir, "screenshots");
const settingsPath = path.join(root, "volume", ".ndx", "settings.json");
const settingsBackupPath = path.join(outDir, "settings.backup.json");
const appContainerHostGateway = process.env.NDX_E2E_HOST_GATEWAY || "172.30.0.1";
const mockRequests = [];
const browserErrors = [];
const consoleErrors = [];
let server;
let browser;
let context;
let traceStopped = false;

await fs.mkdir(screenshotDir, { recursive: true });

function textContains(input, needle) {
  return JSON.stringify(input).includes(needle);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function startMockModelServer() {
  server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url?.endsWith("/models")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [{ id: "ask-user-question-e2e", object: "model" }] }));
      return;
    }
    if (request.method === "POST" && request.url?.endsWith("/responses")) {
      const raw = await readRequestBody(request);
      const body = raw ? JSON.parse(raw) : {};
      mockRequests.push(body);
      response.writeHead(200, { "Content-Type": "application/json" });
      if (textContains(body.input, "function_call_output")) {
        response.end(JSON.stringify({
          output: [{
            type: "message",
            role: "assistant",
            content: [{
              type: "output_text",
              text: "E2E_ASKUSERQUESTION_DONE: 사용자 응답을 받아 다음 이터레이션까지 진행했습니다."
            }]
          }]
        }));
        return;
      }
      response.end(JSON.stringify({
        output: [{
          type: "function_call",
          call_id: "call_e2e_ask_user_question",
          name: "askUserQuestion",
          arguments: JSON.stringify({
            questions: [{
              id: "e2e_choice",
              header: "E2E 확인",
              question: "E2E 응답을 선택하세요.",
              inputType: "single_choice",
              options: [
                { label: "Proceed (Recommended)", description: "Continue the E2E turn." },
                { label: "Stop", description: "Cancel the E2E turn." }
              ]
            }]
          })
        }]
      }));
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(19001, "0.0.0.0", resolve);
  });
}

async function installE2ESettings() {
  const original = await fs.readFile(settingsPath, "utf8");
  await fs.writeFile(settingsBackupPath, original, "utf8");
  const settings = JSON.parse(original);
  settings.model = "ask-user-question-e2e";
  settings.providers = {
    ...settings.providers,
    e2e: { type: "openai", key: "", url: `http://${appContainerHostGateway}:19001/v1` }
  };
  settings.models = {
    ...settings.models,
    "ask-user-question-e2e": {
      name: "ask-user-question-e2e",
      provider: "e2e",
      maxContext: 100000,
      modalities: ["text"]
    }
  };
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function restoreSettings() {
  const backup = await fs.readFile(settingsBackupPath, "utf8").catch(() => undefined);
  if (backup !== undefined) {
    await fs.writeFile(settingsPath, backup, "utf8");
  }
}

async function screenshot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function waitUntil(description, predicate, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${description}`);
}

const result = {
  status: "failed",
  mode: "scenario",
  testedUrl: "http://localhost:18082/",
  report: path.join(outDir, "report.md"),
  trace: path.join(outDir, "trace.zip"),
  screenshots: [],
  mockRequests: 0,
  browserErrors,
  consoleErrors,
  error: undefined
};

try {
  await installE2ESettings();
  await startMockModelServer();

  browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(result.testedUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('[data-testid="project-sidebar-item"]', { hasText: "test1" }).first().waitFor({ state: "visible", timeout: 15000 });
  result.screenshots.push(await screenshot(page, "01-home"));

  await page.locator('[data-testid="project-sidebar-item"]', { hasText: "test1" }).first().locator("> div > div button").nth(2).click();
  await page.getByRole("dialog").filter({ hasText: "ask-user-question-e2e" }).waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "ask-user-question-e2e" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10000 }).catch(() => undefined);
  result.screenshots.push(await screenshot(page, "02-new-session"));

  const prompt = [
    "E2E 테스트입니다.",
    "반드시 askUserQuestion 도구를 먼저 호출하고, 사용자 응답을 받은 뒤 최종 답변에 E2E_ASKUSERQUESTION_DONE 문자열을 포함하세요."
  ].join("\\n");
  await page.getByRole("combobox").fill(prompt);
  await page.locator('form button[type="submit"]').click();

  const questionDialog = page.getByRole("dialog").filter({ hasText: "E2E 확인" });
  await questionDialog.waitFor({ state: "visible", timeout: 60000 });
  await questionDialog.getByText("Proceed (Recommended)").click();
  await questionDialog.getByText("Additional answer").locator("..").locator("textarea").fill("browser e2e note");
  result.screenshots.push(await screenshot(page, "03-question-dialog"));
  await questionDialog.getByRole("button", { name: "Submit" }).click();
  await questionDialog.waitFor({ state: "hidden", timeout: 15000 });

  await waitUntil("second model request after askUserQuestion response", () => mockRequests.length >= 2);
  await page.waitForTimeout(1000);
  for (let pass = 0; pass < 3; pass += 1) {
    const closedSummaries = await page.locator("details:not([open]) > summary").all();
    if (closedSummaries.length === 0) break;
    for (const summary of closedSummaries) {
      if (await summary.isVisible().catch(() => false)) {
        await summary.click().catch(() => undefined);
      }
    }
  }
  await page.getByLabel("Iteration 2 assistant text").filter({ hasText: "E2E_ASKUSERQUESTION_DONE" }).waitFor({ state: "visible", timeout: 60000 });
  result.screenshots.push(await screenshot(page, "04-final-answer"));

  if (mockRequests.length < 2) throw new Error(`expected at least 2 model requests, got ${mockRequests.length}`);
  if (!textContains(mockRequests[0].tools, "askUserQuestion")) throw new Error("first model request did not receive askUserQuestion tool definition");
  if (!textContains(mockRequests[1].input, "function_call_output")) throw new Error("second model request did not include tool output continuation");
  if (!textContains(mockRequests[1].input, "Proceed (Recommended)")) throw new Error("tool output did not include selected option");
  if (!textContains(mockRequests[1].input, "browser e2e note")) throw new Error("tool output did not include additional answer");

  result.status = browserErrors.length === 0 && consoleErrors.length === 0 ? "passed" : "failed";
  await context.tracing.stop({ path: result.trace });
  traceStopped = true;
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  result.mockRequests = mockRequests.length;
  await fs.writeFile(path.join(outDir, "mock-requests.json"), `${JSON.stringify(mockRequests, null, 2)}\n`, "utf8").catch(() => undefined);
  if (context && !traceStopped) {
    await context.tracing.stop({ path: result.trace }).catch(() => undefined);
  }
  await browser?.close().catch(() => undefined);
  await new Promise((resolve) => server?.close(resolve) ?? resolve());
  await restoreSettings();
}

const report = [
  "# askUserQuestion E2E",
  "",
  `- status: ${result.status}`,
  `- mode: ${result.mode}`,
  `- testedUrl: ${result.testedUrl}`,
  `- mockRequests: ${result.mockRequests}`,
  `- trace: ${result.trace}`,
  `- screenshots: ${result.screenshots.length}`,
  result.error ? `- error: ${result.error}` : "",
  "",
  "## Screenshots",
  ...result.screenshots.map((file) => `- ${file}`),
  "",
  "## Browser Errors",
  ...browserErrors.map((error) => `- page: ${error}`),
  ...consoleErrors.map((error) => `- console: ${error}`)
].filter((line) => line !== "").join("\n");
await fs.writeFile(result.report, `${report}\n`, "utf8");
console.log(`askuserquestion-e2e status=${result.status}`);
console.log(`report=${result.report}`);
for (const file of result.screenshots) console.log(`screenshot=${file}`);
if (result.error) console.log(`error=${result.error}`);
process.exit(result.status === "passed" ? 0 : 1);
