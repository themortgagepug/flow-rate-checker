#!/usr/bin/env bash
# Update market_rates in Supabase and fallback rates in codebase
# Usage: ./scripts/update-rates.sh
# Requires: SUPABASE_SERVICE_ROLE_KEY env var (or pass as first arg)
#
# Fetches best uninsured rates from WOWA.ca and updates:
# 1. Supabase market_rates table (live quiz data)
# 2. Local fallback rates in codebase (backup)

set -euo pipefail

SUPABASE_URL="https://dotglplhsdsmrbacmtrx.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$1}"
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$SERVICE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY not set and no argument provided"
  exit 1
fi

# --- Rate input (override via env vars or use defaults) ---
# These should be best UNINSURED rates from WOWA.ca / broker channel
RATE_1YR="${RATE_1YR:-5.09}"
RATE_2YR="${RATE_2YR:-4.59}"
RATE_3YR="${RATE_3YR:-4.19}"
RATE_4YR="${RATE_4YR:-4.29}"
RATE_5YR_FIXED="${RATE_5YR_FIXED:-4.39}"
RATE_5YR_VAR="${RATE_5YR_VAR:-3.85}"
RATE_10YR="${RATE_10YR:-4.99}"
SOURCE="${RATE_SOURCE:-WOWA.ca Best Uninsured Rates}"

echo "Updating rates as of $DATE"
echo "  1yr: $RATE_1YR | 2yr: $RATE_2YR | 3yr: $RATE_3YR"
echo "  4yr: $RATE_4YR | 5yr fixed: $RATE_5YR_FIXED | 5yr var: $RATE_5YR_VAR"
echo "  10yr: $RATE_10YR | Source: $SOURCE"

# --- Update Supabase market_rates table ---
update_rate() {
  local term_key="$1"
  local rate="$2"

  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "$SUPABASE_URL/rest/v1/market_rates?term_key=eq.$term_key&rate_type=eq.uninsured" \
    -X PATCH \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"rate\": $rate, \"source\": \"$SOURCE\", \"updated_at\": \"$DATE\"}")

  if [ "$status" = "204" ]; then
    echo "  [OK] $term_key -> $rate%"
  else
    echo "  [FAIL] $term_key (HTTP $status)"
    return 1
  fi
}

echo ""
echo "Updating Supabase market_rates..."
update_rate "1yr_fixed" "$RATE_1YR"
update_rate "2yr_fixed" "$RATE_2YR"
update_rate "3yr_fixed" "$RATE_3YR"
update_rate "4yr_fixed" "$RATE_4YR"
update_rate "5yr_fixed" "$RATE_5YR_FIXED"
update_rate "5yr_variable" "$RATE_5YR_VAR"
update_rate "10yr_fixed" "$RATE_10YR"

# --- Update fallback rates in codebase ---
CALC_FILE="$REPO_DIR/src/lib/calculations.ts"
SUPA_FILE="$REPO_DIR/src/lib/supabase.ts"

if [ -f "$CALC_FILE" ]; then
  echo ""
  echo "Updating fallback rates in codebase..."

  # Update calculations.ts
  sed -i '' "s/fiveYearFixed: [0-9.]*,/fiveYearFixed: $RATE_5YR_FIXED,/" "$CALC_FILE"
  sed -i '' "s/fiveYearVariable: [0-9.]*,/fiveYearVariable: $RATE_5YR_VAR,/" "$CALC_FILE"
  sed -i '' "s/threeYearFixed: [0-9.]*,/threeYearFixed: $RATE_3YR,/" "$CALC_FILE"
  sed -i '' "s/oneYearFixed: [0-9.]*,/oneYearFixed: $RATE_1YR,/" "$CALC_FILE"
  sed -i '' "s/twoYearFixed: [0-9.]*,/twoYearFixed: $RATE_2YR,/" "$CALC_FILE"
  sed -i '' "s/fourYearFixed: [0-9.]*,/fourYearFixed: $RATE_4YR,/" "$CALC_FILE"

  # Update supabase.ts inline fallbacks
  sed -i '' "s/fiveYearFixed: data.fiveYearFixed ?? [0-9.]*,/fiveYearFixed: data.fiveYearFixed ?? $RATE_5YR_FIXED,/" "$SUPA_FILE"
  sed -i '' "s/fiveYearVariable: data.fiveYearVariable ?? [0-9.]*,/fiveYearVariable: data.fiveYearVariable ?? $RATE_5YR_VAR,/" "$SUPA_FILE"
  sed -i '' "s/threeYearFixed: data.threeYearFixed ?? [0-9.]*,/threeYearFixed: data.threeYearFixed ?? $RATE_3YR,/" "$SUPA_FILE"
  sed -i '' "s/oneYearFixed: data.oneYearFixed ?? [0-9.]*,/oneYearFixed: data.oneYearFixed ?? $RATE_1YR,/" "$SUPA_FILE"
  sed -i '' "s/twoYearFixed: data.twoYearFixed ?? [0-9.]*,/twoYearFixed: data.twoYearFixed ?? $RATE_2YR,/" "$SUPA_FILE"
  sed -i '' "s/fourYearFixed: data.fourYearFixed ?? [0-9.]*,/fourYearFixed: data.fourYearFixed ?? $RATE_4YR,/" "$SUPA_FILE"

  echo "  [OK] Fallback rates updated in source"
fi

echo ""
echo "Done. Rates updated at $DATE"
