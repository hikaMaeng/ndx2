#!/usr/bin/env bash
set -euo pipefail

now_ms() {
  if [[ -r /proc/uptime ]]; then
    awk '{printf "%.0f\n", $1 * 1000}' /proc/uptime
  else
    date +%s%3N
  fi
}

deploy_started_ms="$(now_ms)"
deploy_completed=0

elapsed_ms() {
  local started_ms="$1"
  local ended_ms
  ended_ms="$(now_ms)"
  echo $((ended_ms - started_ms))
}

report_failed_total() {
  local exit_code=$?
  if [[ "$deploy_completed" -eq 0 ]]; then
    echo "deploy-total status=failed exit_code=$exit_code elapsed_ms=$(elapsed_ms "$deploy_started_ms")"
  fi
  exit "$exit_code"
}

trap report_failed_total ERR

usage() {
  echo "usage: deploy.sh [<service> ... | --all]" >&2
}

list_app_services() {
  find apps -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
}

if [[ ! -d apps ]]; then
  echo "missing apps/ directory" >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  mapfile -t services < <(list_app_services)
  if [[ ${#services[@]} -eq 0 ]]; then
    echo "no deployable apps found under apps/" >&2
    exit 2
  fi
  if [[ ${#services[@]} -gt 1 ]]; then
    echo "multiple apps found; pass one service or --all:" >&2
    printf '  %s\n' "${services[@]}" >&2
    exit 2
  fi
elif [[ "${1:-}" == "--all" ]]; then
  mapfile -t services < <(list_app_services)
  if [[ ${#services[@]} -eq 0 ]]; then
    echo "no deployable apps found under apps/" >&2
    exit 2
  fi
else
  services=("$@")
fi

for index in "${!services[@]}"; do
  services[$index]="${services[$index]#apps/}"
  services[$index]="${services[$index]%/}"
done

for service in "${services[@]}"; do
  if [[ ! -d "apps/$service" ]]; then
    echo "unknown service: apps/$service" >&2
    usage
    exit 2
  fi
done

mapfile -t compose_services < <(docker compose config --services)
for service in "${services[@]}"; do
  if ! printf '%s\n' "${compose_services[@]}" | grep -Fxq "$service"; then
    echo "docker-compose.yml has no service named: $service" >&2
    exit 2
  fi
done
resolve_elapsed_ms="$(elapsed_ms "$deploy_started_ms")"
echo "deploy-phase phase=resolve status=ok elapsed_ms=$resolve_elapsed_ms services=${services[*]}"

install_started_ms="$(now_ms)"

if ! command -v yarn >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi

dependency_fingerprint() {
  {
    printf 'deploy-install-v1\n'
    find package.json yarn.lock .yarnrc.yml apps packages \
      \( -name package.json -o -name yarn.lock -o -name .yarnrc.yml \) \
      -type f -print 2>/dev/null | sort | while IFS= read -r path; do
        sha256sum "$path"
      done
  } | sha256sum | awk '{print $1}'
}

install_marker=".yarn/deploy-install.sha256"
current_fingerprint="$(dependency_fingerprint)"
needs_install=1
if [[ -f .pnp.cjs && -f "$install_marker" && "$(cat "$install_marker")" == "$current_fingerprint" ]]; then
  needs_install=0
fi

if [[ "$needs_install" -eq 1 && -f yarn.lock ]]; then
  install_status="ran"
  yarn install --immutable
elif [[ "$needs_install" -eq 1 ]]; then
  install_status="ran"
  yarn install
else
  install_status="skipped"
  echo "dependencies already bootstrapped"
fi
if [[ "$needs_install" -eq 1 ]]; then
  mkdir -p "$(dirname "$install_marker")"
  printf '%s\n' "$current_fingerprint" > "$install_marker"
fi
install_elapsed_ms="$(elapsed_ms "$install_started_ms")"
echo "deploy-phase phase=install status=$install_status elapsed_ms=$install_elapsed_ms"

build_started_ms="$(now_ms)"
build_args=(turbo run build)
for service in "${services[@]}"; do
  build_args+=(--filter="$service")
done
yarn "${build_args[@]}"
build_elapsed_ms="$(elapsed_ms "$build_started_ms")"
echo "deploy-phase phase=build status=ok elapsed_ms=$build_elapsed_ms services=${services[*]}"

service_fingerprint() {
  local service="$1"
  {
    printf 'deploy-runtime-v1\n'
    printf 'service=%s\n' "$service"
    find docker-compose.yml "apps/$service/docker" "apps/$service/dist" \
      -type f -print 2>/dev/null | sort | while IFS= read -r path; do
        sha256sum "$path"
      done
  } | sha256sum | awk '{print $1}'
}

contains_service() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

compose_service_dependencies() {
  local service="$1"
  docker compose config --format json 2>/dev/null | SERVICE_NAME="$service" node -e '
let s = "";
process.stdin.on("data", (d) => s += d);
process.stdin.on("end", () => {
  try {
    const config = JSON.parse(s);
    const dependsOn = config.services?.[process.env.SERVICE_NAME]?.depends_on ?? {};
    if (Array.isArray(dependsOn)) {
      console.log(dependsOn.join("\n"));
      return;
    }
    console.log(Object.keys(dependsOn).join("\n"));
  } catch {
  }
});
' 2>/dev/null || true
}

compose_service_build_config() {
  local service="$1"
  docker compose config --format json 2>/dev/null | SERVICE_NAME="$service" node -e '
let s = "";
process.stdin.on("data", (d) => s += d);
process.stdin.on("end", () => {
  try {
    const svc = JSON.parse(s).services?.[process.env.SERVICE_NAME];
    const build = svc?.build;
    const context = typeof build === "string" ? build : build?.context;
    const dockerfile = typeof build === "object" ? build?.dockerfile : "Dockerfile";
    if (!context || !dockerfile || !svc?.image) {
      process.exit(1);
    }
    console.log([context, dockerfile, svc.image].join("\t"));
  } catch {
    process.exit(1);
  }
});
'
}

curl_with_retry() {
  local url="$1"
  local body=""
  local attempt

  for attempt in {1..30}; do
    body="$(curl -fsS --max-time 5 "$url" 2>/dev/null || true)"
    if [[ -n "$body" ]]; then
      printf '%s\n' "$body"
      return 0
    fi
    sleep 1
  done

  return 1
}

compose_started_ms="$(now_ms)"
mapfile -t running_services < <(docker compose ps --status running --services 2>/dev/null || true)
services_to_refresh=()
for service in "${services[@]}"; do
  deploy_marker=".docker/deploy-$service.sha256"
  current_runtime_fingerprint="$(service_fingerprint "$service")"
  if [[ -f "$deploy_marker" ]] &&
    [[ "$(cat "$deploy_marker")" == "$current_runtime_fingerprint" ]] &&
    printf '%s\n' "${running_services[@]}" | grep -Fxq "$service"; then
    echo "service already current: $service"
  else
    services_to_refresh+=("$service")
  fi
done

if [[ ${#services_to_refresh[@]} -gt 0 ]]; then
  current_project="$(docker compose config --format json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{console.log(JSON.parse(s).name||"")}catch{}})' 2>/dev/null || true)"
  for service in "${services_to_refresh[@]}"; do
    container_name="$(docker compose config --format json 2>/dev/null | SERVICE_NAME="$service" node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const c=JSON.parse(s);const svc=c.services?.[process.env.SERVICE_NAME];console.log(svc?.container_name||"")}catch{}})' 2>/dev/null || true)"
    if [[ -n "$container_name" ]]; then
      existing_project="$(docker inspect "$container_name" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
      if [[ -n "$existing_project" && "$existing_project" != "$current_project" ]]; then
        docker rm -f "$container_name" >/dev/null 2>&1 || true
      fi
    fi
  done

  dependency_services=()
  for service in "${services_to_refresh[@]}"; do
    while IFS= read -r dependency; do
      if [[ -n "$dependency" ]] &&
        ! contains_service "$dependency" "${services_to_refresh[@]}" &&
        ! contains_service "$dependency" "${dependency_services[@]}"; then
        dependency_services+=("$dependency")
      fi
    done < <(compose_service_dependencies "$service")
  done

  if [[ ${#dependency_services[@]} -gt 0 ]]; then
    docker compose up -d --no-build "${dependency_services[@]}"
  fi
  for service in "${services_to_refresh[@]}"; do
    IFS=$'\t' read -r build_context build_dockerfile image_name < <(compose_service_build_config "$service")
    if [[ -z "${build_context:-}" || -z "${build_dockerfile:-}" || -z "${image_name:-}" ]]; then
      echo "docker-compose.yml has incomplete build config for service: $service" >&2
      exit 2
    fi
    if [[ "$build_dockerfile" != /* ]]; then
      build_dockerfile="$build_context/$build_dockerfile"
    fi
    docker build -t "$image_name" -f "$build_dockerfile" "$build_context"
  done
  docker compose up -d --no-deps --force-recreate "${services_to_refresh[@]}"
  mkdir -p .docker
  for service in "${services_to_refresh[@]}"; do
    service_fingerprint "$service" > ".docker/deploy-$service.sha256"
  done
fi
if [[ ${#services_to_refresh[@]} -gt 0 ]]; then
  compose_status="refreshed"
else
  compose_status="already-current"
fi
compose_elapsed_ms="$(elapsed_ms "$compose_started_ms")"
echo "deploy-phase phase=compose status=$compose_status elapsed_ms=$compose_elapsed_ms refresh_count=${#services_to_refresh[@]}"

verify_started_ms="$(now_ms)"
verify_status="ok"
deploy_report_lines=()
for service in "${services[@]}"; do
  if contains_service "$service" "${services_to_refresh[@]}"; then
    refresh_status="refreshed"
  else
    refresh_status="already-current"
  fi

  port_target="$(docker compose port "$service" 18080 2>/dev/null || true)"
  port_number="${port_target##*:}"
  health_status="skipped"
  health_body=""
  api_health_status="skipped"
  api_health_body=""

  if [[ -n "$port_target" && "$port_number" =~ ^[0-9]+$ ]]; then
    health_body="$(curl_with_retry "http://127.0.0.1:$port_number/health" || true)"
    if [[ -n "$health_body" ]]; then
      health_status="ok"
    else
      health_status="failed"
      verify_status="failed"
    fi

    api_health_body="$(curl_with_retry "http://127.0.0.1:$port_number/api/health" || true)"
    if [[ -n "$api_health_body" ]]; then
      api_health_status="ok"
    else
      api_health_status="failed"
      verify_status="failed"
    fi
  fi

  echo "deploy-summary service=$service refresh=$refresh_status port=${port_target:-none} health=$health_status api_health=$api_health_status"
  deploy_report_lines+=("service=$service refresh=$refresh_status port=${port_target:-none} health=$health_status api_health=$api_health_status")
  if [[ -n "$health_body" ]]; then
    echo "health-body $health_body"
    deploy_report_lines+=("health-body service=$service body=$health_body")
  fi
  if [[ -n "$api_health_body" ]]; then
    echo "api-health-body $api_health_body"
    deploy_report_lines+=("api-health-body service=$service body=$api_health_body")
  fi
done
verify_elapsed_ms="$(elapsed_ms "$verify_started_ms")"
echo "deploy-phase phase=verify status=$verify_status elapsed_ms=$verify_elapsed_ms"

if [[ "$verify_status" != "ok" ]]; then
  total_elapsed_ms="$(elapsed_ms "$deploy_started_ms")"
  deploy_completed=1
  trap - ERR
  echo "deploy-total status=failed elapsed_ms=$total_elapsed_ms services=${services[*]}"
  echo "deploy-report-begin"
  echo "결과: status=failed services=${services[*]} compose=$compose_status"
  echo "시간: total=${total_elapsed_ms}ms resolve=${resolve_elapsed_ms}ms install=${install_elapsed_ms}ms build=${build_elapsed_ms}ms compose=${compose_elapsed_ms}ms verify=${verify_elapsed_ms}ms"
  for line in "${deploy_report_lines[@]}"; do
    echo "검증: $line"
  done
  echo "변경: files_edited=none"
  echo "deploy-report-end"
  exit 1
fi

if [[ ${#services[@]} -eq 1 ]]; then
  echo "deployed ${services[0]}"
else
  printf 'deployed services: %s\n' "${services[*]}"
fi

deploy_completed=1
trap - ERR
total_elapsed_ms="$(elapsed_ms "$deploy_started_ms")"
echo "deploy-total status=ok elapsed_ms=$total_elapsed_ms services=${services[*]}"
echo "deploy-report-begin"
echo "결과: status=ok services=${services[*]} compose=$compose_status"
echo "시간: total=${total_elapsed_ms}ms resolve=${resolve_elapsed_ms}ms install=${install_elapsed_ms}ms build=${build_elapsed_ms}ms compose=${compose_elapsed_ms}ms verify=${verify_elapsed_ms}ms"
for line in "${deploy_report_lines[@]}"; do
  echo "검증: $line"
done
echo "변경: files_edited=none"
echo "deploy-report-end"
