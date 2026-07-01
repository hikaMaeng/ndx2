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
current_phase="startup"
failure_reason="unhandled"
services=()
resolve_elapsed_ms=0
install_elapsed_ms=0
build_elapsed_ms=0
compose_elapsed_ms=0
verify_elapsed_ms=0
compose_status="not-started"
deploy_report_lines=()

export TURBO_TELEMETRY_DISABLED="${TURBO_TELEMETRY_DISABLED:-1}"
git_config_index="${GIT_CONFIG_COUNT:-0}"
export GIT_CONFIG_COUNT=$((git_config_index + 1))
export "GIT_CONFIG_KEY_${git_config_index}=safe.directory"
export "GIT_CONFIG_VALUE_${git_config_index}=$(pwd -P)"

elapsed_ms() {
  local started_ms="$1"
  local ended_ms
  ended_ms="$(now_ms)"
  echo $((ended_ms - started_ms))
}

print_failed_report() {
  local exit_code="$1"
  local total_elapsed_ms
  local service_list
  total_elapsed_ms="$(elapsed_ms "$deploy_started_ms")"
  if [[ ${#services[@]} -gt 0 ]]; then
    service_list="${services[*]}"
  else
    service_list="unknown"
  fi
  echo "deploy-total status=failed exit_code=$exit_code elapsed_ms=$total_elapsed_ms services=$service_list phase=$current_phase reason=$failure_reason"
  echo "deploy-report-begin"
  echo "결과: status=failed services=$service_list phase=$current_phase reason=$failure_reason exit_code=$exit_code"
  echo "시간: total=${total_elapsed_ms}ms resolve=${resolve_elapsed_ms}ms install=${install_elapsed_ms}ms build=${build_elapsed_ms}ms compose=${compose_elapsed_ms}ms verify=${verify_elapsed_ms}ms"
  for line in "${deploy_report_lines[@]}"; do
    echo "검증: $line"
  done
  echo "변경: files_edited=none"
  echo "deploy-report-end"
}

fail_deploy() {
  local exit_code="$1"
  if [[ "$deploy_completed" -eq 0 ]]; then
    deploy_completed=1
    trap - ERR
    print_failed_report "$exit_code"
  fi
  exit "$exit_code"
}

report_failed_total() {
  local exit_code=$?
  fail_deploy "$exit_code"
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
  fail_deploy 2
fi

current_phase="resolve"
failure_reason="service-resolution"
if [[ $# -eq 0 ]]; then
  mapfile -t services < <(list_app_services)
  if [[ ${#services[@]} -eq 0 ]]; then
    echo "no deployable apps found under apps/" >&2
    fail_deploy 2
  fi
  if [[ ${#services[@]} -gt 1 ]]; then
    echo "multiple apps found; pass one service or --all:" >&2
    printf '  %s\n' "${services[@]}" >&2
    fail_deploy 2
  fi
elif [[ "${1:-}" == "--all" ]]; then
  mapfile -t services < <(list_app_services)
  if [[ ${#services[@]} -eq 0 ]]; then
    echo "no deployable apps found under apps/" >&2
    fail_deploy 2
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
    fail_deploy 2
  fi
done

mapfile -t compose_services < <(docker compose config --services)
for service in "${services[@]}"; do
  if ! printf '%s\n' "${compose_services[@]}" | grep -Fxq "$service"; then
    echo "docker-compose.yml has no service named: $service" >&2
    fail_deploy 2
  fi
done
resolve_elapsed_ms="$(elapsed_ms "$deploy_started_ms")"
echo "deploy-phase phase=resolve status=ok elapsed_ms=$resolve_elapsed_ms services=${services[*]}"

current_phase="install"
failure_reason="dependency-install"
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
install_reason="fingerprint-changed"
if [[ -f .pnp.cjs && -f "$install_marker" && "$(cat "$install_marker")" == "$current_fingerprint" ]]; then
  if yarn turbo --version >/dev/null 2>&1; then
    needs_install=0
    install_reason="up-to-date"
  else
    install_reason="pnp-cache-missing"
  fi
elif [[ ! -f .pnp.cjs ]]; then
  install_reason="pnp-missing"
elif [[ ! -f "$install_marker" ]]; then
  install_reason="marker-missing"
fi

if [[ "$needs_install" -eq 1 && -f yarn.lock ]]; then
  install_status="ran"
  echo "dependencies bootstrap required reason=$install_reason"
  if yarn install --immutable; then
    true
  else
    install_exit_code=$?
    install_elapsed_ms="$(elapsed_ms "$install_started_ms")"
    fail_deploy "$install_exit_code"
  fi
elif [[ "$needs_install" -eq 1 ]]; then
  install_status="ran"
  echo "dependencies bootstrap required reason=$install_reason"
  if yarn install; then
    true
  else
    install_exit_code=$?
    install_elapsed_ms="$(elapsed_ms "$install_started_ms")"
    fail_deploy "$install_exit_code"
  fi
else
  install_status="skipped"
  echo "dependencies already bootstrapped"
fi
if [[ "$needs_install" -eq 1 ]]; then
  mkdir -p "$(dirname "$install_marker")"
  printf '%s\n' "$current_fingerprint" > "$install_marker"
fi
install_elapsed_ms="$(elapsed_ms "$install_started_ms")"
echo "deploy-phase phase=install status=$install_status reason=$install_reason elapsed_ms=$install_elapsed_ms"

current_phase="build"
failure_reason="build"
build_started_ms="$(now_ms)"
build_args=(turbo run build)
for service in "${services[@]}"; do
  build_args+=(--filter="$service")
done
build_output=""
if build_output="$(yarn "${build_args[@]}" 2>&1)"; then
  printf '%s\n' "$build_output"
else
  build_exit_code=$?
  printf '%s\n' "$build_output"
  if printf '%s\n' "$build_output" | grep -Eq 'Required package missing from disk|Missing package:'; then
    failure_reason="build-pnp-cache-missing"
    echo "deploy-phase phase=build-recover status=ran reason=pnp-cache-missing"
    if [[ -f yarn.lock ]]; then
      if yarn install --immutable; then
        true
      else
        build_exit_code=$?
        build_elapsed_ms="$(elapsed_ms "$build_started_ms")"
        fail_deploy "$build_exit_code"
      fi
    else
      if yarn install; then
        true
      else
        build_exit_code=$?
        build_elapsed_ms="$(elapsed_ms "$build_started_ms")"
        fail_deploy "$build_exit_code"
      fi
    fi
    mkdir -p "$(dirname "$install_marker")"
    printf '%s\n' "$current_fingerprint" > "$install_marker"
    if build_output="$(yarn "${build_args[@]}" 2>&1)"; then
      printf '%s\n' "$build_output"
    else
      build_exit_code=$?
      printf '%s\n' "$build_output"
      build_elapsed_ms="$(elapsed_ms "$build_started_ms")"
      fail_deploy "$build_exit_code"
    fi
  else
    build_elapsed_ms="$(elapsed_ms "$build_started_ms")"
    fail_deploy "$build_exit_code"
  fi
fi
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

health_host_candidates() {
  local port_host="$1"
  local gateway

  case "$port_host" in
    ""|"0.0.0.0"|"::"|"[::]")
      printf '%s\n' "127.0.0.1"
      printf '%s\n' "localhost"
      if getent hosts host.docker.internal >/dev/null 2>&1; then
        printf '%s\n' "host.docker.internal"
      fi
      gateway="$(ip route show default 2>/dev/null | awk 'NR == 1 {print $3}')"
      if [[ -n "$gateway" ]]; then
        printf '%s\n' "$gateway"
      fi
      ;;
    *)
      printf '%s\n' "${port_host#[}"
      ;;
  esac
}

check_health_path() {
  local body_var="$1"
  local url_var="$2"
  local path="$3"
  local port_host="$4"
  local port_number="$5"
  local candidate
  local url
  local body

  while IFS= read -r candidate; do
    if [[ -z "$candidate" ]]; then
      continue
    fi
    url="http://$candidate:$port_number$path"
    body="$(curl_with_retry "$url" || true)"
    if [[ -n "$body" ]]; then
      printf -v "$body_var" '%s' "$body"
      printf -v "$url_var" '%s' "$url"
      return 0
    fi
  done < <(health_host_candidates "$port_host" | awk '!seen[$0]++')

  return 1
}

published_port_valid() {
  local port_target="$1"
  local port_number="${port_target##*:}"
  [[ -n "$port_target" && "$port_number" =~ ^[1-9][0-9]*$ ]]
}

current_phase="compose"
failure_reason="compose"
compose_started_ms="$(now_ms)"
compose_config_output="$(docker compose config 2>&1)" || {
  echo "$compose_config_output" >&2
  compose_elapsed_ms="$(elapsed_ms "$compose_started_ms")"
  failure_reason="compose-config"
  deploy_report_lines+=("compose-config status=failed output=$(printf '%s' "$compose_config_output" | tr '\n' ' ' | head -c 400)")
  fail_deploy 2
}
mapfile -t running_services < <(docker compose ps --status running --services 2>/dev/null || true)
services_to_refresh=()
for service in "${services[@]}"; do
  deploy_marker=".docker/deploy-$service.sha256"
  current_runtime_fingerprint="$(service_fingerprint "$service")"
  current_port="$(docker compose port "$service" 18080 2>/dev/null || true)"
  if [[ -f "$deploy_marker" ]] &&
    [[ "$(cat "$deploy_marker")" == "$current_runtime_fingerprint" ]] &&
    printf '%s\n' "${running_services[@]}" | grep -Fxq "$service" &&
    published_port_valid "$current_port"; then
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
      compose_elapsed_ms="$(elapsed_ms "$compose_started_ms")"
      fail_deploy 2
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

current_phase="verify"
failure_reason="verify"
verify_started_ms="$(now_ms)"
verify_status="ok"
for service in "${services[@]}"; do
  if contains_service "$service" "${services_to_refresh[@]}"; then
    refresh_status="refreshed"
  else
    refresh_status="already-current"
  fi

  port_target="$(docker compose port "$service" 18080 2>/dev/null || true)"
  port_number="${port_target##*:}"
  port_host="${port_target%:*}"
  port_host="${port_host#[}"
  port_host="${port_host%]}"
  port_reason="ok"
  health_status="skipped"
  health_body=""
  health_url=""
  api_health_status="skipped"
  api_health_body=""
  api_health_url=""

  if [[ -z "$port_target" ]]; then
    port_reason="published-port-missing"
    health_status="failed"
    api_health_status="failed"
    verify_status="failed"
  elif ! published_port_valid "$port_target"; then
    port_reason="published-port-invalid"
    health_status="failed"
    api_health_status="failed"
    verify_status="failed"
  else
    if check_health_path health_body health_url "/health" "$port_host" "$port_number"; then
      health_status="ok"
    else
      health_status="failed"
      verify_status="failed"
    fi

    if check_health_path api_health_body api_health_url "/api/health" "$port_host" "$port_number"; then
      api_health_status="ok"
    else
      api_health_status="failed"
      verify_status="failed"
    fi
  fi

  echo "deploy-summary service=$service refresh=$refresh_status port=${port_target:-none} port_reason=$port_reason health=$health_status api_health=$api_health_status"
  deploy_report_lines+=("service=$service refresh=$refresh_status port=${port_target:-none} port_reason=$port_reason health=$health_status api_health=$api_health_status health_url=${health_url:-none} api_health_url=${api_health_url:-none}")
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
  echo "deploy-total status=failed elapsed_ms=$total_elapsed_ms services=${services[*]} phase=verify reason=healthcheck-failed"
  echo "deploy-report-begin"
  echo "결과: status=failed services=${services[*]} compose=$compose_status phase=verify reason=healthcheck-failed"
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
