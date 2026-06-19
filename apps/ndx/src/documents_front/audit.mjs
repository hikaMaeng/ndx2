import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const documentsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(documentsDir, "../../../..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function walkMarkdown(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      output.push(path.relative(documentsDir, fullPath).replaceAll("\\", "/"));
    }
  }
  return output.sort();
}

function walkDirectories(relativeRoot, maxDepth) {
  const root = path.join(repoRoot, relativeRoot);
  const output = [];
  function visit(directory, depth) {
    if (depth > maxDepth) {
      return;
    }
    const relativeDirectory = path.relative(repoRoot, directory).replaceAll("\\", "/");
    if (depth > 0 && directoryHasFiles(directory)) {
      output.push(relativeDirectory);
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        visit(path.join(directory, entry.name), depth + 1);
      }
    }
  }
  visit(root, 0);
  return output.sort();
}

function listFiles(relativeRoot, extension) {
  const root = path.join(repoRoot, relativeRoot);
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.posix.join(relativeRoot, entry.name))
    .sort();
}

function directoryHasFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile()) {
      return true;
    }
    if (entry.isDirectory() && directoryHasFiles(path.join(directory, entry.name))) {
      return true;
    }
  }
  return false;
}

function pathIsCoveredBySurface(sourcePath, coveragePaths) {
  return coveragePaths.some((coveragePath) => sourcePath === coveragePath || sourcePath.startsWith(`${coveragePath}/`) || coveragePath.startsWith(`${sourcePath}/`));
}

function localMarkdownImageReferences(markdownFiles) {
  const references = [];
  for (const file of markdownFiles) {
    const text = fs.readFileSync(path.join(documentsDir, file), "utf8");
    for (const match of text.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
      const src = match[1].trim().replace(/^<|>$/g, "");
      if (/^(?:https?:|data:|mailto:|#)/i.test(src)) {
        continue;
      }
      const sourcePath = src.split(/\s+/)[0];
      const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(file), sourcePath));
      references.push({ file, src: sourcePath, resolvedPath });
    }
  }
  return references;
}

const catalogPath = "apps/ndx/src/documents_front/catalog.ts";
const assetsPath = "apps/ndx/src/documents_front/assets.ts";
const coveragePath = "apps/ndx/src/documents_front/coverage.json";
const documentSitePath = "apps/ndx/src/documents_front/DocumentSite.tsx";
const documentMainPath = "apps/ndx/src/documents_front/main.tsx";
const serverAppPath = "apps/ndx/src/server/app.ts";
const sidebarPath = "apps/ndx/src/webclient_front/menu/components/Sidebar.tsx";
const stylesPath = "apps/ndx/src/documents_front/styles.css";
const sourceInventoryPath = "apps/ndx/src/documents_front/reference/source-inventory.md";
const repositoryInstructionFiles = ["AGENTS.md"];

for (const requiredPath of [catalogPath, assetsPath, coveragePath, documentSitePath, documentMainPath, serverAppPath, sidebarPath, stylesPath, sourceInventoryPath]) {
  if (!exists(requiredPath)) {
    fail(`required file missing: ${requiredPath}`);
  }
}

for (const instructionPath of repositoryInstructionFiles) {
  if (!exists(instructionPath)) {
    fail(`repository instruction file missing: ${instructionPath}`);
  }
}

const catalog = read(catalogPath);
const assets = read(assetsPath);
const coverage = JSON.parse(read(coveragePath));
const documentSite = read(documentSitePath);
const documentMain = read(documentMainPath);
const serverApp = read(serverAppPath);
const sidebar = read(sidebarPath);
const styles = read(stylesPath);
const sourceInventory = read(sourceInventoryPath);
const markdownFiles = walkMarkdown(documentsDir);
const importedMarkdown = [...catalog.matchAll(/from "\.\/([^"]+\.md)\?raw"/g)].map((match) => match[1]).sort();
const importedSet = new Set(importedMarkdown);
const markdownSet = new Set(markdownFiles);
const catalogIds = new Set([...catalog.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]));
const allMarkdownText = markdownFiles.map((file) => fs.readFileSync(path.join(documentsDir, file), "utf8")).join("\n\n");
const coveragePaths = coverage.flatMap((surface) => Array.isArray(surface.paths) ? surface.paths : []);
const scannedSourceDirectories = [
  ...walkDirectories("apps/ndx/src", 3),
  ...walkDirectories("packages/ndx/src", 3)
];
const rootDocs = listFiles("docs", ".md");
const documentImageReferences = localMarkdownImageReferences(markdownFiles);

for (const directory of ["getting-started", "architecture", "capabilities", "operations", "reference", "resources"]) {
  if (!exists(`apps/ndx/src/documents_front/${directory}`)) {
    fail(`document category directory missing: ${directory}`);
  }
}

for (const file of markdownFiles) {
  if (!importedSet.has(file)) {
    fail(`markdown file is not imported by catalog: ${file}`);
  }
  const text = fs.readFileSync(path.join(documentsDir, file), "utf8");
  if (!text.startsWith("# ")) {
    fail(`markdown file must start with an H1: ${file}`);
  }
  if (text.trim().length < 500) {
    fail(`markdown file is too thin for developer docs: ${file}`);
  }
}

for (const file of importedMarkdown) {
  if (!markdownSet.has(file)) {
    fail(`catalog imports missing markdown file: ${file}`);
  }
}

if (!documentSite.includes("ReactMarkdown") || !documentSite.includes("remarkGfm")) {
  fail("DocumentSite must render markdown through ReactMarkdown with remark-gfm.");
}

if (!documentSite.includes("documentAssetUrl") || !assets.includes("?url")) {
  fail("DocumentSite must route local markdown images through Vite document assets.");
}

if (!documentSite.includes("bg-black") || !styles.includes(".ndx-doc-markdown")) {
  fail("document surface must keep the black-base markdown theme.");
}

if (!documentMain.includes("DocumentSite") || !documentMain.includes("ReactDOM.createRoot")) {
  fail("documents front must have its own React entrypoint.");
}

if (!serverApp.includes('app.use("/docs"') || !serverApp.includes("documentsFrontDir")) {
  fail("server must serve the documents front as a separate /docs site.");
}

if (!sidebar.includes('href="/docs"') || !sidebar.includes('target="_blank"')) {
  fail("left sidebar must expose a /docs link that opens a new tab.");
}

for (const surface of coverage) {
  if (!surface.id || !Array.isArray(surface.paths) || !Array.isArray(surface.requiredDocumentIds)) {
    fail(`coverage surface is malformed: ${JSON.stringify(surface)}`);
    continue;
  }
  for (const sourcePath of surface.paths) {
    if (!exists(sourcePath)) {
      fail(`coverage source path missing for ${surface.id}: ${sourcePath}`);
    }
    if (!allMarkdownText.includes(sourcePath)) {
      fail(`coverage source path is not mentioned by markdown: ${sourcePath}`);
    }
  }
  for (const documentId of surface.requiredDocumentIds) {
    if (!catalogIds.has(documentId)) {
      fail(`coverage surface ${surface.id} references missing document id: ${documentId}`);
    }
  }
}

for (const sourcePath of scannedSourceDirectories) {
  if (!sourceInventory.includes(`\`${sourcePath}\``)) {
    fail(`source inventory is missing scanned directory: ${sourcePath}`);
  }
  if (!pathIsCoveredBySurface(sourcePath, coveragePaths)) {
    fail(`coverage surfaces do not cover scanned directory: ${sourcePath}`);
  }
}

for (const match of sourceInventory.matchAll(/`((?:apps|packages)\/ndx\/src[^`]+)`/g)) {
  const documentedPath = match[1];
  if (!exists(documentedPath)) {
    fail(`source inventory documents a missing path: ${documentedPath}`);
  }
}

// Every inline source-path reference inside any markdown document must resolve to a
// real file or directory. This catches doc drift after package/path reorganizations
// (for example tool/function-tool relocation). Template placeholders (`<...>`) and
// trailing glob segments (`/*`) are allowed because they describe a path family.
for (const file of markdownFiles) {
  const text = fs.readFileSync(path.join(documentsDir, file), "utf8");
  for (const match of text.matchAll(/`((?:apps|packages)\/ndx\/src[^`]+)`/g)) {
    const documentedPath = match[1];
    if (documentedPath.includes("<") || documentedPath.includes(">")) {
      continue;
    }
    const concretePath = documentedPath.replace(/\/\*.*$/, "");
    if (!exists(concretePath)) {
      fail(`markdown references a missing source path in ${file}: ${documentedPath}`);
    }
  }
}

for (const instructionPath of repositoryInstructionFiles) {
  const text = read(instructionPath);
  for (const match of text.matchAll(/`((?:apps|packages|docs)\/[^`]*|(?:apps|packages|docs))`/g)) {
    const documentedPath = match[1];
    if (documentedPath.includes("<") || documentedPath.includes(">") || documentedPath.includes("*")) {
      continue;
    }
    const concretePath = documentedPath.replace(/\/$/, "").replace(/\/\*.*$/, "");
    if (!exists(concretePath)) {
      fail(`repository instructions reference a missing path in ${instructionPath}: ${documentedPath}`);
    }
  }
}

for (const rootDoc of rootDocs) {
  if (!allMarkdownText.includes(`\`${rootDoc}\``)) {
    fail(`root docs file is not referenced by app documents: ${rootDoc}`);
  }
}

if (documentImageReferences.length === 0) {
  fail("document site must include at least one local image reference.");
}

for (const reference of documentImageReferences) {
  if (reference.resolvedPath.startsWith("../")) {
    fail(`markdown image escapes document root in ${reference.file}: ${reference.src}`);
    continue;
  }
  if (!fs.existsSync(path.join(documentsDir, reference.resolvedPath))) {
    fail(`markdown image target is missing in ${reference.file}: ${reference.src}`);
  }
  if (!assets.includes(`"${reference.resolvedPath}"`) && !assets.includes(`'${reference.resolvedPath}'`) && !assets.includes(`./${reference.resolvedPath}`)) {
    fail(`markdown image target is not listed in document assets: ${reference.resolvedPath}`);
  }
}

const report = {
  ok: failures.length === 0,
  markdownFiles: markdownFiles.length,
  catalogImports: importedMarkdown.length,
  documentImageReferences: documentImageReferences.length,
  coverageSurfaces: coverage.length,
  scannedSourceDirectories: scannedSourceDirectories.length,
  rootDocs: rootDocs.length,
  failures
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
