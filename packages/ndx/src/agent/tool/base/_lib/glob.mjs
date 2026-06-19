import path from "node:path";

export function normalizeGlobPath(value) {
  return value.split(path.sep).join("/");
}

export function compileGlob(pattern) {
  return new RegExp(`^${globToRegExpSource(normalizeGlobPath(pattern))}$`);
}

export function matchesGlob(filePath, regex, roots) {
  const projectRelative = normalizeGlobPath(path.relative(roots.projectHome, filePath));
  const rootRelative = normalizeGlobPath(path.relative(roots.searchRoot, filePath));
  const base = path.basename(filePath);
  return regex.test(projectRelative) || regex.test(rootRelative) || regex.test(base);
}

function globToRegExpSource(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*") {
      if (next === "*") {
        const after = pattern[index + 2];
        if (after === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if (char === "[") {
      const end = findClassEnd(pattern, index + 1);
      if (end > index) {
        source += classSource(pattern.slice(index + 1, end));
        index = end;
        continue;
      }
    }
    if (char === "{") {
      const end = findBraceEnd(pattern, index + 1);
      if (end > index) {
        const alternatives = splitBraceAlternatives(pattern.slice(index + 1, end));
        source += `(?:${alternatives.map(globToRegExpSource).join("|")})`;
        index = end;
        continue;
      }
    }
    source += escapeRegExp(char);
  }
  return source;
}

function findClassEnd(pattern, start) {
  for (let index = start; index < pattern.length; index += 1) {
    if (pattern[index] === "]" && index > start) {
      return index;
    }
  }
  return -1;
}

function classSource(body) {
  const negated = body[0] === "!";
  const raw = negated ? body.slice(1) : body;
  return `[${negated ? "^" : ""}${raw.replace(/\\/g, "\\\\").replace(/\]/g, "\\]")}]`;
}

function findBraceEnd(pattern, start) {
  let depth = 0;
  for (let index = start; index < pattern.length; index += 1) {
    if (pattern[index] === "{") depth += 1;
    if (pattern[index] === "}") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function splitBraceAlternatives(body) {
  const alternatives = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "{") depth += 1;
    if (body[index] === "}") depth -= 1;
    if (body[index] === "," && depth === 0) {
      alternatives.push(body.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(body.slice(start));
  return alternatives;
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
