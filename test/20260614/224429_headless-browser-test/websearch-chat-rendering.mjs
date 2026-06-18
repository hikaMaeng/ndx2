#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/home/hika/.local/lib/node_modules/playwright/package.json");
const { chromium } = require("playwright");

const outDir = "/mnt/f/dev/ndx2/test/20260614/224429_headless-browser-test";
const screenshotDir = path.join(outDir, "screenshots");
const tracePath = path.join(outDir, "trace.zip");
const testedUrl = "http://127.0.0.1:5174/";
const executablePath = "/home/hika/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const model = {
  type: "openai",
  provider: "mock-websearch",
  model: "mock-websearch-model",
  url: "http://mock.local/v1",
  token: "",
  contextsize: 100000,
  modalities: ["text"],
  reasoningEffort: "medium"
};

const session = {
  chatsessionid: "search-session",
  folderid: "root",
  userid: "ndev",
  title: "웹검색 렌더링 테스트",
  model,
  isrunning: false,
  createdat: "2026-06-14T00:00:00.000Z",
  lastupdated: "2026-06-14T00:00:00.000Z"
};

let sequence = 0;
const rows = [];
const consoleErrors = [];
const pageErrors = [];
const screenshots = [];
const steps = [];

function row(type, contents) {
  sequence += 1;
  return {
    dataid: String(sequence),
    sessionid: session.chatsessionid,
    type,
    contents,
    createdat: new Date(Date.UTC(2026, 5, 14, 0, 0, sequence)).toISOString()
  };
}

function promptRows(text) {
  const isFood = text.includes("마포구");
  const finalText = isFood
    ? [
      "## 마포구 공덕동 브랜드 패스트푸드 웹검색 결과",
      "- **버거킹 공덕역점**",
      "- **맘스터치 공덕역점**",
      "- **써브웨이 공덕역점**",
      "",
      "웹검색 기준으로 중복 후보를 제거해 정리했습니다."
    ].join("\n")
    : [
      "## 지난 3일간 20% 이상 상승 종목 3개",
      "- **AAA 바이오**: +31.2%",
      "- **BBB 테크**: +24.8%",
      "- **CCC 에너지**: +21.4%",
      "",
      "웹검색 기준으로 최근 3거래일 상승률 후보를 좁혔습니다."
    ].join("\n");
  return [
    row("user", { kind: "user_message", text }),
    row("assistant", { kind: "assistant_reasoning", iteration: 1, summary: "Need web_search before answering." }),
    row("assistant", { kind: "assistant_delta", iteration: 1, delta: "웹검색을 시작합니다", content: "웹검색을 시작합니다" }),
    row("tool_call", { kind: "tool_call", iteration: 1, toolCalls: [{ name: "web_search", arguments: JSON.stringify({ query: text }) }] }),
    row("assistant", { kind: "tool_result", iteration: 1, results: [{ toolCallId: "web-search-1", tool: "web_search", success: true, output: "mocked web search evidence" }] }),
    row("assistant", { kind: "assistant_message", text: finalText })
  ];
}

function sse(event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function screenshot(page, name) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}

async function step(name, fn) {
  const entry = { name, status: "passed" };
  try {
    await fn();
  } catch (error) {
    entry.status = "failed";
    entry.error = error instanceof Error ? error.message : String(error);
    steps.push(entry);
    throw error;
  }
  steps.push(entry);
}

await fs.mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let status = "passed";
let errorText = "";
let finalUrl = "";
let title = "";
let context;

try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR" });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("ndx.agent.web.clientid", "018f0000-0000-7000-8000-000000000001");
    localStorage.setItem("ndx.agent.web.state.cache", JSON.stringify({ version: 1, locale: "ko", projects: [], selectedUserid: "ndev" }));
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/agent", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      service: "agent",
      version: "test",
      surface: "webclient",
      session: { path: "/session", healthUrl: `${testedUrl}api/session/health`, socketUrl: "ws://127.0.0.1:5174/session" },
      workspace: { hostRoot: "/tmp", hostWorkspaceRoot: "/tmp/workspace", containerWorkspaceRoot: "/workspace" }
    })
  }));
  await page.route("**/assets/i18n/ko.json", async (route) => route.fulfill({
    contentType: "application/json",
    body: await fs.readFile("/mnt/f/dev/ndx2/apps/ndx/assets/i18n/ko.json", "utf8")
  }));
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/session/health", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok" }) }));
  await page.route("**/api/agent/web-client-state**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ clientid: "018f0000-0000-7000-8000-000000000001", userid: "ndev", state: { version: 1, locale: "ko", projects: [], selectedUserid: "ndev" } })
  }));
  await page.route("**/api/agent/web-projects", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/api/agent/users", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ users: [{ userid: "ndev", created: "2026-06-14T00:00:00.000Z" }] }) }));
  await page.route("**/api/agent/web-providers", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ providers: [] }) }));
  await page.route("**/api/agent/chat/folders?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ folders: [{ folderid: "root", userid: "ndev", title: "root", kind: "root", screenorder: 0, createdat: "2026-06-14T00:00:00.000Z", updatedat: "2026-06-14T00:00:00.000Z" }] })
  }));
  await page.route("**/api/agent/chat/folders/root/sessions?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ sessions: [session] }) }));
  await page.route("**/api/agent/chat/sessions/search-session/data?**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ chatSession: session, data: rows })
  }));
  await page.route("**/api/agent/chat/sessions/search-session/messages", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || "{}");
    const nextRows = promptRows(String(body.text || ""));
    rows.push(...nextRows);
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
      body: [
        sse({ kind: "assistant_reasoning", text: "Need web_search before answering." }),
        sse({ kind: "assistant_delta", text: "웹검색을 시작합니다" }),
        sse({ kind: "complete", session, data: rows })
      ].join("")
    });
  });

  await step("open app", async () => {
    await page.goto(testedUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("main").waitFor({ state: "visible", timeout: 15000 });
    await screenshot(page, "app-open");
  });

  await step("open mocked chat session", async () => {
    await page.getByRole("button", { name: "웹검색 렌더링 테스트" }).dispatchEvent("click");
    await page.getByRole("heading", { name: "웹검색 렌더링 테스트" }).waitFor({ timeout: 10000 });
    await screenshot(page, "chat-session-open");
  });

  const prompts = [
    {
      text: "마포구 공덕동의 모든 브랜드 패스트푸드점을 조사해",
      expected: "마포구 공덕동 브랜드 패스트푸드 웹검색 결과",
      screenshot: "prompt-1-food"
    },
    {
      text: "주가종목을 분석하여 지난 3일간 20%이상 오른 주식 3개만 찾아내",
      expected: "지난 3일간 20% 이상 상승 종목 3개",
      screenshot: "prompt-2-stock"
    }
  ];

  for (const prompt of prompts) {
    await step(`submit prompt: ${prompt.text}`, async () => {
      await page.getByRole("textbox", { name: "채팅 입력" }).fill(prompt.text);
      await page.getByRole("button", { name: "보내기" }).click();
      await page.getByText(prompt.expected).waitFor({ state: "visible", timeout: 10000 });
      await screenshot(page, prompt.screenshot);
    });
  }

  await step("verify hidden intermediate stream/tool rows", async () => {
    const forbidden = [
      "Need web_search before answering.",
      "웹검색을 시작합니다",
      "mocked web search evidence",
      "tool_call",
      "tool result"
    ];
    for (const text of forbidden) {
      const count = await page.getByText(text, { exact: false }).count();
      if (count !== 0) {
        throw new Error(`forbidden intermediate text is visible: ${text}`);
      }
    }
  });

  await step("verify markdown rendered", async () => {
    const strongCount = await page.locator("strong").filter({ hasText: /버거킹|AAA 바이오/ }).count();
    if (strongCount < 2) {
      throw new Error(`expected markdown strong elements for final answers, got ${strongCount}`);
    }
  });

  finalUrl = page.url();
  title = await page.title();
  await context.tracing.stop({ path: tracePath });
  context = undefined;
} catch (error) {
  status = "failed";
  errorText = error instanceof Error ? error.message : String(error);
} finally {
  if (context) {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
  }
  await browser.close();
}

const report = {
  status,
  mode: "scenario",
  testedUrl,
  finalUrl,
  title,
  prompts: [
    "마포구 공덕동의 모든 브랜드 패스트푸드점을 조사해",
    "주가종목을 분석하여 지난 3일간 20%이상 오른 주식 3개만 찾아내"
  ],
  screenshots,
  trace: tracePath,
  consoleErrors,
  pageErrors,
  steps,
  ...(errorText ? { error: errorText } : {})
};

await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(outDir, "report.md"), [
  "# Headless Browser Test",
  "",
  `- status: ${status}`,
  "- mode: scenario",
  `- testedUrl: ${testedUrl}`,
  `- finalUrl: ${finalUrl || "(not reached)"}`,
  `- title: ${title || "(empty)"}`,
  `- trace: ${tracePath}`,
  `- screenshots: ${screenshots.length}`,
  `- consoleErrors: ${consoleErrors.length}`,
  `- pageErrors: ${pageErrors.length}`,
  errorText ? `- error: ${errorText}` : "",
  "",
  "## Prompts",
  ...report.prompts.map((prompt) => `- ${prompt}`),
  "",
  "## Screenshots",
  ...screenshots.map((file) => `- ${file}`),
  "",
  "## Step Results",
  ...steps.map((item, index) => `- ${index + 1}. ${item.name}: ${item.status}${item.error ? ` - ${item.error}` : ""}`),
  "",
  "## Browser Errors",
  ...consoleErrors.map((error) => `- console: ${error}`),
  ...pageErrors.map((error) => `- page: ${error}`)
].filter(Boolean).join("\n"), "utf8");

console.log(`headless-browser-test status=${status}`);
console.log("mode=scenario");
console.log(`report=${path.join(outDir, "report.md")}`);
for (const file of screenshots) console.log(`screenshot=${file}`);
process.exit(status === "passed" ? 0 : 1);
