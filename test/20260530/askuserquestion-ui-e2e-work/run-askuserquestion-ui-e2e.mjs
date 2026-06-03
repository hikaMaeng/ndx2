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
  `${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}_askuserquestion-ui-e2e`
);
const screenshotDir = path.join(outDir, "screenshots");
const settingsPath = path.join(root, "volume", ".ndx", "settings.json");
const settingsBackupPath = path.join(outDir, "settings.backup.json");
const appContainerHostGateway = process.env.NDX_E2E_HOST_GATEWAY || "172.30.0.1";
const mockRequests = [];
const browserErrors = [];
const consoleErrors = [];
const longHeader = "ASK_USER_QUESTION_LONG_HEADER: 긴 질문과 긴 선택지를 검수하기 위한 제목입니다. 이 제목은 모달 상단 타이틀과 중복되면 안 되고 본문 질문 카드 안에서만 한 번 보여야 합니다.";
const longQuestion = [
  "이번 검수는 e2e 확인처럼 짧은 문장이 아니라 실제 사용 중 모델이 보낼 수 있는 긴 질문을 대상으로 합니다.",
  "질문 본문이 여러 문장으로 길어져도 모달 전체가 화면 밖으로 밀려나지 않고, 본문 영역이 스크롤되며, 텍스트가 가로로 넘치지 않아야 합니다.",
  "또한 선택지는 상세한 장단점을 포함할 수 있으므로 선택지 라벨과 설명 모두 줄바꿈되어 읽을 수 있어야 합니다."
].join(" ");
const longOptionLabel = "Proceed with the long validated path (Recommended) - 선택지 라벨 자체가 길어도 라디오 행의 오른쪽으로 뚫고 나가지 않아야 합니다";
const longOptionDescription = "이 선택지는 현재 구현을 유지하면서 긴 질문, 긴 선택지, 추가 답변, 이미지 붙여넣기 첨부가 모두 다음 모델 이터레이션으로 전달되는지 검증합니다.";
const pastedPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
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
        const inputText = JSON.stringify(body.input);
        const sawImageDataUrl = inputText.includes(`data:image/png;base64,${pastedPngBase64}`);
        const sawAdditionalAnswer = inputText.includes("browser e2e note with pasted image");
        response.end(JSON.stringify({
          output: [{
            type: "message",
            role: "assistant",
            content: [{
              type: "output_text",
              text: sawImageDataUrl && sawAdditionalAnswer
                ? "E2E_ASKUSERQUESTION_IMAGE_INLINE_DONE: 모델 요청에서 askUserQuestion 이미지 data URL과 추가 답변을 확인했습니다."
                : `E2E_ASKUSERQUESTION_IMAGE_INLINE_MISSING: image=${sawImageDataUrl} note=${sawAdditionalAnswer}`
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
              header: longHeader,
              question: longQuestion,
              inputType: "single_choice",
              options: [
                { label: longOptionLabel, description: longOptionDescription },
                { label: "Stop and keep the current session unchanged", description: "현재 턴을 취소하고 이미지와 추가 답변이 모델로 전달되지 않는 경로를 검증합니다." }
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
      modalities: ["text", "image"]
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
    "반드시 askUserQuestion 도구를 먼저 호출하고, 사용자 응답을 받은 뒤 최종 답변에 E2E_ASKUSERQUESTION_UI_DONE 문자열을 포함하세요."
  ].join("\\n");
  await page.getByRole("combobox").fill(prompt);
  await page.locator('form button[type="submit"]').click();

  const questionDialog = page.getByRole("dialog").filter({ hasText: "ASK_USER_QUESTION_LONG_HEADER" });
  await questionDialog.waitFor({ state: "visible", timeout: 60000 });
  await questionDialog.getByRole("heading", { name: /응답 필요|Response needed/ }).waitFor({ state: "visible", timeout: 10000 });
  const repeatedHeaderCount = await questionDialog.getByText(longHeader, { exact: true }).count();
  if (repeatedHeaderCount !== 1) throw new Error(`expected long header once inside dialog body, got ${repeatedHeaderCount}`);
  await questionDialog.getByText(longOptionLabel, { exact: true }).click();
  const additionalLabel = questionDialog.getByText("추가 답변", { exact: true }).or(questionDialog.getByText("Additional answer", { exact: true }));
  await additionalLabel.waitFor({ state: "visible", timeout: 10000 });
  const textarea = questionDialog.locator("textarea").first();
  await textarea.fill("browser e2e note with pasted image");
  await textarea.focus();
  await page.evaluate(async () => {
    const textareaElement = document.querySelector("[data-question-id='e2e_choice'] textarea");
    if (!textareaElement) throw new Error("question textarea not found");
    const binary = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted-proof.png", { type: "image/png" }));
    textareaElement.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  });
  await questionDialog.getByRole("img", { name: "pasted-proof.png" }).waitFor({ state: "visible", timeout: 10000 });
  const imageComplete = await questionDialog.getByRole("img", { name: "pasted-proof.png" }).evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0);
  if (!imageComplete) throw new Error("pasted image preview did not render");
  const layout = await questionDialog.evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const overflowing = [];
    for (const element of dialog.querySelectorAll("h3,p,label,span,textarea")) {
      const item = element.getBoundingClientRect();
      if (item.right > rect.right + 2) overflowing.push(element.textContent?.slice(0, 80) || element.tagName);
    }
    return {
      height: rect.height,
      viewportHeight: window.innerHeight,
      overflowing
    };
  });
  if (layout.height > layout.viewportHeight * 0.9) throw new Error(`dialog height ${layout.height} exceeds viewport budget ${layout.viewportHeight}`);
  if (layout.overflowing.length > 0) throw new Error(`dialog has horizontal overflow: ${layout.overflowing.join(" | ")}`);
  result.screenshots.push(await screenshot(page, "03-question-dialog"));
  await questionDialog.getByRole("button", { name: /제출|Submit/ }).click();
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
  await page.getByLabel("Iteration 2 assistant text").filter({ hasText: "E2E_ASKUSERQUESTION_IMAGE_INLINE_DONE" }).waitFor({ state: "visible", timeout: 60000 });
  result.screenshots.push(await screenshot(page, "04-final-answer"));

  if (mockRequests.length < 2) throw new Error(`expected at least 2 model requests, got ${mockRequests.length}`);
  if (!textContains(mockRequests[0].tools, "askUserQuestion")) throw new Error("first model request did not receive askUserQuestion tool definition");
  if (!textContains(mockRequests[1].input, "function_call_output")) throw new Error("second model request did not include tool output continuation");
  if (!textContains(mockRequests[1].input, longOptionLabel)) throw new Error("tool output did not include selected long option");
  if (!textContains(mockRequests[1].input, "browser e2e note with pasted image")) throw new Error("tool output did not include additional answer");
  if (!textContains(mockRequests[1].input, "input_image")) throw new Error("second model request did not include pasted image as input_image");
  if (!textContains(mockRequests[1].input, `data:image/png;base64,${pastedPngBase64}`)) throw new Error("second model request did not inline pasted image bytes as a data URL");

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
