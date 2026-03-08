#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Nammerha Platform — OWASP ZAP API Security Scan
# ═══════════════════════════════════════════════════════════════════════════════
# Usage: ./scripts/zap-scan.sh [target_url]
# Default: http://localhost:3001
#
# Prerequisites:
#   - Docker installed and running
#   - Backend server running at target URL
#
# Output: reports/zap-report-<timestamp>.html
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
TARGET_URL="${1:-http://host.docker.internal:3001}"
REPORT_DIR="$(cd "$(dirname "$0")/.." && pwd)/reports"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_NAME="zap-report-${TIMESTAMP}.html"
ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"
RULES_FILE="$(cd "$(dirname "$0")" && pwd)/zap-rules.conf"
ALERT_THRESHOLD="MEDIUM"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  NAMMERHA — OWASP ZAP Dynamic Application Security Testing  ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Target:${NC}  ${TARGET_URL}"
echo -e "${YELLOW}Report:${NC}  ${REPORT_DIR}/${REPORT_NAME}"
echo ""

# ─── Pre-flight Check ───────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo -e "${RED}ERROR: Docker is not installed or not in PATH${NC}"
  exit 1
fi

# Check if target is reachable
echo -e "${YELLOW}[1/4] Checking target availability...${NC}"
if ! curl -sf --connect-timeout 5 "${TARGET_URL/host.docker.internal/localhost}/health" >/dev/null 2>&1; then
  echo -e "${RED}ERROR: Target ${TARGET_URL} is not reachable.${NC}"
  echo -e "${RED}       Ensure the backend is running: cd backend && npm run dev${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Target is reachable${NC}"

# ─── Create report directory ────────────────────────────────────────────────
mkdir -p "${REPORT_DIR}"

# ─── Run ZAP API Scan ───────────────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Pulling OWASP ZAP Docker image...${NC}"
docker pull "${ZAP_IMAGE}" 2>/dev/null || true

echo -e "${YELLOW}[3/4] Running ZAP API scan...${NC}"
echo -e "${YELLOW}       This may take 5-15 minutes depending on API surface.${NC}"
echo ""

# Run ZAP in API scan mode against the backend
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "${REPORT_DIR}:/zap/wrk:rw" \
  "${ZAP_IMAGE}" \
  zap-api-scan.py \
    -t "${TARGET_URL}" \
    -f openapi \
    -r "${REPORT_NAME}" \
    -w "zap-report-${TIMESTAMP}.md" \
    -J "zap-report-${TIMESTAMP}.json" \
    -l "${ALERT_THRESHOLD}" \
    -I \
  2>&1 | tee "${REPORT_DIR}/zap-console-${TIMESTAMP}.log"

ZAP_EXIT=$?

# ─── Results Analysis ───────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}[4/4] Scan Results:${NC}"

if [ ${ZAP_EXIT} -eq 0 ]; then
  echo -e "${GREEN}  ✓ No alerts at or above ${ALERT_THRESHOLD} severity${NC}"
elif [ ${ZAP_EXIT} -eq 1 ]; then
  echo -e "${RED}  ✗ FAIL: Alerts found at ${ALERT_THRESHOLD}+ severity${NC}"
  echo -e "${RED}    Review report: ${REPORT_DIR}/${REPORT_NAME}${NC}"
elif [ ${ZAP_EXIT} -eq 2 ]; then
  echo -e "${YELLOW}  ⚠ WARN: Warnings found (below ${ALERT_THRESHOLD})${NC}"
else
  echo -e "${RED}  ✗ ZAP scan encountered an error (exit code: ${ZAP_EXIT})${NC}"
fi

echo ""
echo -e "${CYAN}  Reports saved to:${NC}"
echo -e "    HTML:    ${REPORT_DIR}/${REPORT_NAME}"
echo -e "    JSON:    ${REPORT_DIR}/zap-report-${TIMESTAMP}.json"
echo -e "    Console: ${REPORT_DIR}/zap-console-${TIMESTAMP}.log"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

exit ${ZAP_EXIT}
