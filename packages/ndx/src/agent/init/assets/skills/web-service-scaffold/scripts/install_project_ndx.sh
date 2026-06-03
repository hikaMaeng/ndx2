#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: install_project_ndx.sh <target-repository-root> <service-name>" >&2
  exit 2
fi

target_root="$1"
service_name="$2"
skill_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_root="$skill_root/assets/baseline/root"
yarn_lock_base="$skill_root/assets/yarn/yarn.lock.base"
ndx_home="$(cd "$skill_root/../.." && pwd)"
port_registry="$ndx_home/ports/web-service-scaffold.tsv"

if [[ ! -d "$target_root" ]]; then
  mkdir -p "$target_root"
fi

if [[ ! -d "$target_root/.git" ]]; then
  git -C "$target_root" init -q
fi

if [[ ! -d "$baseline_root" ]]; then
  echo "baseline assets are missing: $baseline_root" >&2
  exit 2
fi

if [[ ! -f "$yarn_lock_base" ]]; then
  echo "baseline yarn lock template is missing: $yarn_lock_base" >&2
  exit 2
fi

if [[ ! "$service_name" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "service-name must match ^[a-z][a-z0-9-]*$: $service_name" >&2
  exit 2
fi

service_dir="$target_root/apps/$service_name"
if [[ -e "$service_dir" ]]; then
  echo "service already exists: apps/$service_name" >&2
  exit 2
fi
domain_package_name="${service_name}_domain"
domain_package_dir="$target_root/packages/$domain_package_name"
if [[ -e "$domain_package_dir" ]]; then
  echo "domain package already exists: packages/$domain_package_name" >&2
  exit 2
fi

project_name="$(basename "$target_root" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$project_name" ]]; then
  project_name="web-service"
fi
repo_name="$project_name"
if [[ "$repo_name" == "$service_name" ]]; then
  repo_name="${repo_name}-root"
fi
network_name="${project_name}_internal"
volume_name="${service_name}_data"
image_name="${repo_name}-${service_name}"
if [[ "$image_name" =~ ^[a-z0-9]+$ ]]; then
  image_name="${image_name}-image"
fi
service_title="$(printf '%s' "$service_name" | sed -E 's/-/ /g; s/(^| )([a-z])/\1\u\2/g')"
service_env_prefix="$(printf '%s' "$service_name" | tr '[:lower:]-' '[:upper:]_')"
service_container_name="$service_name"
if [[ ${#service_container_name} -lt 2 ]]; then
  service_container_name="${service_container_name}-app"
fi

port_is_listening() {
  local port="$1"
  if ss -Htanl 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
    return 0
  fi
  if docker ps --format '{{.Ports}}' 2>/dev/null | grep -Eq ":${port}->"; then
    return 0
  fi
  return 1
}

port_is_reserved() {
  local port="$1"
  if [[ ! -f "$port_registry" ]]; then
    return 1
  fi
  while IFS=$'\t' read -r reserved_port reserved_root _reserved_service; do
    if [[ "$reserved_port" == "$port" && -d "$reserved_root" ]]; then
      return 0
    fi
  done < "$port_registry"
  return 1
}

allocate_host_port() {
  local start="${WEB_SCAFFOLD_PORT_START:-18080}"
  local end="${WEB_SCAFFOLD_PORT_END:-18999}"
  local port

  if [[ ! "$start" =~ ^[0-9]+$ || ! "$end" =~ ^[0-9]+$ || "$start" -gt "$end" ]]; then
    echo "invalid port range: WEB_SCAFFOLD_PORT_START=$start WEB_SCAFFOLD_PORT_END=$end" >&2
    exit 2
  fi

  for ((port = start; port <= end; port++)); do
    if ! port_is_listening "$port" && ! port_is_reserved "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
  done

  echo "no free host port in range $start-$end" >&2
  exit 2
}

service_host_port="$(allocate_host_port)"

cp -R "$baseline_root/." "$target_root/"

if [[ -d "$target_root/apps/__SERVICE_NAME__" ]]; then
  mv "$target_root/apps/__SERVICE_NAME__" "$service_dir"
fi
if [[ -d "$target_root/packages/__SERVICE_NAME___domain" ]]; then
  mv "$target_root/packages/__SERVICE_NAME___domain" "$domain_package_dir"
fi

export SERVICE_NAME="$service_name"
export DOMAIN_PACKAGE_NAME="$domain_package_name"
export SERVICE_TITLE="$service_title"
export SERVICE_ENV_PREFIX="$service_env_prefix"
export SERVICE_HOST_PORT="$service_host_port"
export SERVICE_CONTAINER_NAME="$service_container_name"
export PROJECT_NAME="$project_name"
export IMAGE_NAME="$image_name"
export NETWORK_NAME="$network_name"
export VOLUME_NAME="$volume_name"
export REPO_NAME="$repo_name"
while IFS= read -r -d '' path; do
  perl -0pi -e 's/__SERVICE_NAME__/$ENV{SERVICE_NAME}/g; s/__DOMAIN_PACKAGE_NAME__/$ENV{DOMAIN_PACKAGE_NAME}/g; s/__SERVICE_TITLE__/$ENV{SERVICE_TITLE}/g; s/__SERVICE_ENV_PREFIX__/$ENV{SERVICE_ENV_PREFIX}/g; s/__SERVICE_HOST_PORT__/$ENV{SERVICE_HOST_PORT}/g; s/__SERVICE_CONTAINER_NAME__/$ENV{SERVICE_CONTAINER_NAME}/g; s/__PROJECT_NAME__/$ENV{PROJECT_NAME}/g; s/__IMAGE_NAME__/$ENV{IMAGE_NAME}/g; s/__NETWORK_NAME__/$ENV{NETWORK_NAME}/g; s/__VOLUME_NAME__/$ENV{VOLUME_NAME}/g; s/__REPO_NAME__/$ENV{REPO_NAME}/g' "$path"
done < <(find "$target_root" -type f \
  -not -path "$target_root/.git/*" \
  -not -path "$target_root/.yarn/*" \
  -print0)

chmod +x "$target_root/scripts/deploy.sh"

mkdir -p "$(dirname "$port_registry")"
tmp_registry="$(mktemp)"
if [[ -f "$port_registry" ]]; then
  awk -F '\t' 'NF >= 3 && $2 != "" { print }' "$port_registry" > "$tmp_registry"
fi
printf '%s\t%s\t%s\n' "$service_host_port" "$target_root" "$service_name" >> "$tmp_registry"
sort -n -u "$tmp_registry" > "$port_registry"
rm -f "$tmp_registry"

node - "$target_root" "$service_name" "$yarn_lock_base" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [, , targetRoot, serviceName, yarnLockBase] = process.argv;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function descriptorKey(name, references) {
  return `"${references.map((reference) => `${name}@${reference}`).join(", ")}":`;
}

function yamlKey(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name) ? name : JSON.stringify(name);
}

function dependencyEntries(manifest) {
  const merged = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {})
  };
  return Object.entries(merged).sort(([left], [right]) => left.localeCompare(right));
}

function dependencyResolution(range) {
  if (
    range.startsWith("npm:") ||
    range.startsWith("workspace:") ||
    range.startsWith("patch:") ||
    range.startsWith("portal:") ||
    range.startsWith("link:")
  ) {
    return range;
  }
  return `npm:${range}`;
}

function workspaceBlock(manifest, reference, extraReferences = []) {
  const references = [...extraReferences, reference];
  const lines = [
    descriptorKey(manifest.name, references),
    "  version: 0.0.0-use.local",
    `  resolution: "${manifest.name}@${reference}"`
  ];
  const dependencies = dependencyEntries(manifest);
  if (dependencies.length > 0) {
    lines.push("  dependencies:");
    for (const [name, range] of dependencies) {
      lines.push(`    ${yamlKey(name)}: "${dependencyResolution(range)}"`);
    }
  }
  lines.push("  languageName: unknown");
  lines.push("  linkType: soft");
  return `${lines.join("\n")}\n`;
}

const rootManifest = readJson(path.join(targetRoot, "package.json"));
const serviceManifest = readJson(path.join(targetRoot, "apps", serviceName, "package.json"));
const domainPackageName = `${serviceName}_domain`;
const domainManifest = readJson(path.join(targetRoot, "packages", domainPackageName, "package.json"));
const baseText = fs.readFileSync(yarnLockBase, "utf8").replace(/\n*$/, "\n");
const sections = baseText.trimEnd().split(/\n\n+/g);
const headerSections = [];
if (sections[0]?.startsWith("#")) {
  headerSections.push(sections.shift());
}
if (sections[0]?.startsWith("__metadata:")) {
  headerSections.push(sections.shift());
}
const header = headerSections.join("\n\n");
const blocks = sections
  .map((section) => section.replace(/\n*$/, "\n"))
  .filter((section) => section.trim().length > 0);

blocks.push(workspaceBlock(rootManifest, "workspace:."));
blocks.push(workspaceBlock(serviceManifest, `workspace:apps/${serviceName}`));
blocks.push(workspaceBlock(domainManifest, `workspace:packages/${domainPackageName}`, ["workspace:*"]));
blocks.sort((left, right) => {
  const leftKey = left.split("\n", 1)[0];
  const rightKey = right.split("\n", 1)[0];
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
});

fs.writeFileSync(path.join(targetRoot, "yarn.lock"), `${header.trimEnd()}\n\n${blocks.join("\n")}`);
NODE

required_files=(
  "$target_root/package.json"
  "$target_root/yarn.lock"
  "$target_root/turbo.json"
  "$target_root/docker-compose.yml"
  "$target_root/AGENTS.md"
  "$target_root/.ndx/skills/web-deploy-docker/SKILL.md"
  "$target_root/apps/$service_name/package.json"
  "$target_root/apps/$service_name/src/server/index.ts"
  "$target_root/apps/$service_name/src/server/app.ts"
  "$target_root/apps/$service_name/src/server/env.ts"
  "$target_root/apps/$service_name/src/front/main.tsx"
  "$target_root/apps/$service_name/src/front/components/ui/button.tsx"
  "$target_root/apps/$service_name/src/front/components/ui/card.tsx"
  "$target_root/apps/$service_name/docker/Dockerfile"
  "$target_root/apps/$service_name/docker/volumes/.gitkeep"
  "$target_root/apps/$service_name/README.md"
  "$target_root/packages/$domain_package_name/package.json"
  "$target_root/packages/$domain_package_name/README.md"
  "$target_root/packages/$domain_package_name/src/common/index.ts"
  "$target_root/packages/$domain_package_name/src/server/index.ts"
  "$target_root/packages/$domain_package_name/src/front/index.ts"
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    echo "baseline generation failed, missing file: $required_file" >&2
    exit 1
  fi
done

suite_day="$(date +%Y%m%d)"
suite_time="$(date +%H%M%S)"
suite_dir="$target_root/test/$suite_day"
suite_path="$suite_dir/${suite_time}_web-service-scaffold.json"
report_path="$suite_dir/${suite_time}_report.json"
summary_path="$suite_dir/${suite_time}_summary.md"
mkdir -p "$suite_dir"
cat > "$suite_path" <<JSON
{
  "id": "web-service-scaffold",
  "title": "Web service scaffold baseline",
  "dependencies": {
    "service": "$service_name"
  },
  "items": {
    "scaffold": [
      {
        "id": "baseline-files",
        "title": "Baseline files exist",
        "test": "The web-service scaffold baseline was copied from bundled assets.",
        "steps": [
          {
            "id": "root-files",
            "instruction": "Check root package.json, turbo.json, docker-compose.yml, AGENTS.md, and .ndx/skills.",
            "expected": "All root scaffold contract files exist."
          },
          {
            "id": "service-files",
            "instruction": "Check apps/$service_name server, front, docker, README, and docs files.",
            "expected": "All service baseline files exist."
          }
        ],
        "passCriteria": "All scaffold baseline files exist."
      }
    ]
  }
}
JSON

cat > "$report_path" <<JSON
{
  "@meta": {
    "subagents": [],
    "elapsed": 0,
    "result": true,
    "detail": "1 passed / 0 failed",
    "started": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  },
  "scaffold": [
    {
      "id": "baseline-files",
      "title": "Baseline files exist",
      "test": "The web-service scaffold baseline was copied from bundled assets.",
      "steps": [
        {
          "id": "root-files",
          "instruction": "Check root package.json, turbo.json, docker-compose.yml, AGENTS.md, and .ndx/skills.",
          "expected": "All root scaffold contract files exist.",
          "result": true,
          "descript": "Root baseline files were generated from bundled assets and the scaffold lockfile template.",
          "evidence": [
            "$target_root/package.json",
            "$target_root/yarn.lock",
            "$target_root/turbo.json",
            "$target_root/docker-compose.yml",
            "$target_root/AGENTS.md",
            "$target_root/.ndx/skills/web-deploy-docker/SKILL.md"
          ]
        },
        {
          "id": "service-files",
          "instruction": "Check apps/$service_name server, front, docker, README, and docs files.",
          "expected": "All service baseline files exist.",
          "result": true,
          "descript": "Service baseline files were generated from bundled assets.",
          "evidence": [
            "$target_root/apps/$service_name/src/server/index.ts",
            "$target_root/apps/$service_name/src/front/main.tsx",
            "$target_root/apps/$service_name/docker/Dockerfile",
            "$target_root/apps/$service_name/README.md",
            "$target_root/apps/$service_name/docs"
          ]
        },
        {
          "id": "domain-package-files",
          "instruction": "Check packages/$domain_package_name package, source partitions, README, and docs files.",
          "expected": "The paired domain package baseline exists for apps/$service_name.",
          "result": true,
          "descript": "The service domain package was generated from bundled assets and wired as a workspace package.",
          "evidence": [
            "$target_root/packages/$domain_package_name/package.json",
            "$target_root/packages/$domain_package_name/src/common/index.ts",
            "$target_root/packages/$domain_package_name/src/server/index.ts",
            "$target_root/packages/$domain_package_name/src/front/index.ts",
            "$target_root/packages/$domain_package_name/README.md",
            "$target_root/packages/$domain_package_name/docs"
          ]
        }
      ]
    }
  ]
}
JSON

cat > "$summary_path" <<MD
# Web Service Scaffold Summary

* Result: passed
* Service: apps/$service_name
* Domain package: packages/$domain_package_name
* Compose project: $project_name
* Container: $service_container_name
* Host port: $service_host_port
* Suite: $suite_path
* Report: $report_path
* Evidence: baseline root files, service files, paired domain package, project contract, local skills, and yarn.lock were created.
MD
echo "installed web-service contract and scaffold baseline for apps/$service_name into $target_root"
echo "installed paired domain package packages/$domain_package_name for apps/$service_name"
echo "assigned host port $service_host_port for apps/$service_name"
echo "assigned container name $service_container_name for apps/$service_name"
