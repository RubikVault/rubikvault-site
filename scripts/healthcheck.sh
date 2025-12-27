#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:8788}}"

ENDPOINTS=(
  "/api/market-health"
  "/api/price-snapshot"
  "/api/top-movers"
  "/api/earnings-calendar"
  "/api/news"
  "/api/tech-signals"
  "/api/macro-rates"
  "/api/snapshots/market_health"
  "/api/snapshots/macro_rates"
)

ok_count=0
partial_count=0
fail_count=0

echo "Running healthcheck against: ${BASE_URL}"

for endpoint in "${ENDPOINTS[@]}"; do
  url="${BASE_URL}${endpoint}"
  tmp_body="$(mktemp)"
  tmp_headers="$(mktemp)"

  http_code="$(curl -sS -m 10 -D "${tmp_headers}" -o "${tmp_body}" -w "%{http_code}" "${url}" || true)"
  content_type="$(grep -i '^content-type:' "${tmp_headers}" | head -n1 | cut -d: -f2- | tr -d '\r' | xargs || true)"

  status="FAIL"
  message="HTTP ${http_code}"
  exit_code=1

  if [[ "${http_code}" == "200" ]]; then
    set +e
    result="$(python - "${tmp_body}" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
ok = data.get("ok")
print("OK" if ok is True else "PARTIAL" if ok is False else "FAIL")
PY
)"
    py_status=$?
    set -e

    if [[ ${py_status} -eq 0 ]]; then
      if [[ "${result}" == "OK" ]]; then
        status="OK"
        message="ok"
        exit_code=0
      elif [[ "${result}" == "PARTIAL" ]]; then
        status="PARTIAL"
        message="ok:false"
        exit_code=2
      else
        status="FAIL"
        message="invalid schema"
        exit_code=1
      fi
    else
      status="FAIL"
      message="invalid json"
      exit_code=1
    fi
  fi

  rm -f "${tmp_body}" "${tmp_headers}"

  if [[ "${status}" == "OK" ]]; then
    ok_count=$((ok_count + 1))
  elif [[ "${status}" == "PARTIAL" ]]; then
    partial_count=$((partial_count + 1))
  else
    fail_count=$((fail_count + 1))
  fi

  printf "%-32s %-8s %s (content-type: %s)\n" "${endpoint}" "${status}" "${message}" "${content_type:-unknown}"
done

echo "Summary: OK=${ok_count} PARTIAL=${partial_count} FAIL=${fail_count}"

if [[ ${fail_count} -gt 0 ]]; then
  exit 1
fi
if [[ ${partial_count} -gt 0 ]]; then
  exit 2
fi
exit 0
