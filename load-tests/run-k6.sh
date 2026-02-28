#!/bin/bash
# Usage: ./run-k6.sh [staging|production] <k6-script> [extra k6 args...]
#
# Examples:
#   ./run-k6.sh staging hub-redirect-load.js                        # local exec, stream to cloud
#   ./run-k6.sh staging hub-redirect-load.js --cloud-exec           # cloud exec (Grafana generators)
#   ./run-k6.sh staging redirect-load.js -e SCENARIO=cloud          # local exec, cloud scenario
#   ./run-k6.sh staging redirect-load.js --cloud-exec -e SCENARIO=cloud  # full cloud run
#   ./run-k6.sh staging redirect-load.js --no-cloud                 # local only, no cloud streaming

set -euo pipefail

ENV="${1:-staging}"
SCRIPT="${2:?Usage: ./run-k6.sh [staging|production] <script.js> [k6 args...]}"
shift 2

ENV_FILE="$(dirname "$0")/.env.${ENV}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

if [ "$ENV" = "production" ]; then
  echo ""
  echo "  ⚠️  WARNING: Targeting PRODUCTION infrastructure"
  echo ""
  read -p "  Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# Export all vars from the env file
set -a
source "$ENV_FILE"
set +a

# Parse custom flags (--cloud-exec, --no-cloud) and pass the rest to k6
CLOUD_EXEC=false
NO_CLOUD=false
K6_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --cloud-exec) CLOUD_EXEC=true ;;
    --no-cloud)   NO_CLOUD=true ;;
    *)            K6_ARGS+=("$arg") ;;
  esac
done

echo "Environment: $ENV"
echo "Script:      $SCRIPT"
echo "Hub URL:     ${HUB_URL:-n/a}"
echo "Worker URL:  ${WORKER_URL:-n/a}"

# Ensure results directory exists (k6 runs from repo root)
mkdir -p load-tests/results

if [ "$CLOUD_EXEC" = true ]; then
  # Cloud execution: Grafana Cloud generates the load from distributed infrastructure
  # Env vars must be forwarded as -e flags since cloud runners don't have local env
  if [ -z "${K6_CLOUD_TOKEN:-}" ]; then
    echo "Error: K6_CLOUD_TOKEN required for --cloud-exec"
    exit 1
  fi

  # Forward all env vars the scripts may need as -e flags
  ENV_FLAGS=()
  [ -n "${WORKER_URL:-}" ]                && ENV_FLAGS+=(-e "WORKER_URL=$WORKER_URL")
  [ -n "${HUB_URL:-}" ]                   && ENV_FLAGS+=(-e "HUB_URL=$HUB_URL")
  [ -n "${ADMIN_URL:-}" ]                 && ENV_FLAGS+=(-e "ADMIN_URL=$ADMIN_URL")
  [ -n "${UPSTASH_REDIS_REST_URL:-}" ]    && ENV_FLAGS+=(-e "UPSTASH_REDIS_REST_URL=$UPSTASH_REDIS_REST_URL")
  [ -n "${UPSTASH_REDIS_REST_TOKEN:-}" ]  && ENV_FLAGS+=(-e "UPSTASH_REDIS_REST_TOKEN=$UPSTASH_REDIS_REST_TOKEN")
  [ -n "${CRON_SECRET:-}" ]               && ENV_FLAGS+=(-e "CRON_SECRET=$CRON_SECRET")
  [ -n "${TEST_EMAIL:-}" ]                && ENV_FLAGS+=(-e "TEST_EMAIL=$TEST_EMAIL")
  [ -n "${TEST_PASSWORD:-}" ]             && ENV_FLAGS+=(-e "TEST_PASSWORD=$TEST_PASSWORD")
  [ -n "${LOADTEST_EVENT_ID:-}" ]         && ENV_FLAGS+=(-e "LOADTEST_EVENT_ID=$LOADTEST_EVENT_ID")

  echo "Execution:   CLOUD (Grafana Cloud load generators)"
  echo ""
  exec k6 cloud "${ENV_FLAGS[@]+"${ENV_FLAGS[@]}"}" "${K6_ARGS[@]+"${K6_ARGS[@]}"}" "load-tests/$SCRIPT"
elif [ "$NO_CLOUD" = true ]; then
  echo "Execution:   LOCAL (no cloud streaming)"
  echo ""
  exec k6 run "${K6_ARGS[@]+"${K6_ARGS[@]}"}" "load-tests/$SCRIPT"
elif [ -n "${K6_CLOUD_TOKEN:-}" ]; then
  echo "Execution:   LOCAL (streaming metrics to Grafana Cloud)"
  echo ""
  exec k6 run --out cloud "${K6_ARGS[@]+"${K6_ARGS[@]}"}" "load-tests/$SCRIPT"
else
  echo "Execution:   LOCAL (no K6_CLOUD_TOKEN)"
  echo ""
  exec k6 run "${K6_ARGS[@]+"${K6_ARGS[@]}"}" "load-tests/$SCRIPT"
fi
