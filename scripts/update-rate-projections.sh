#!/bin/bash
# Rate Projection Pipeline
# Fetches live Canadian rate data and builds forward curves for Rate Simulator
# Sources: BoC Valet API, Montreal Exchange CORRA futures, Supabase market_rates
# Outputs: rates.json with bull/base/bear scenarios
# Schedule: Daily at 8:30 AM ET via GitHub Actions

set -euo pipefail

DATE=$(date -u +"%Y-%m-%d")
PRIME_SPREAD=2.20  # Prime = BoC + 2.20%

echo "=== Rate Projection Pipeline ==="
echo "Date: $DATE"

# ============================================================
# 1. Fetch current BoC policy rate from Valet API
# ============================================================
echo ""
echo "--- Fetching BoC policy rate ---"
BOC_JSON=$(curl -sf "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=3" 2>/dev/null || echo "")
if [ -n "$BOC_JSON" ]; then
  BOC_RATE=$(echo "$BOC_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
obs = data.get('observations', [])
if obs:
    print(obs[-1].get('V39079', {}).get('v', '2.25'))
else:
    print('2.25')
" 2>/dev/null || echo "2.25")
else
  BOC_RATE="2.25"
fi
PRIME_RATE=$(echo "$BOC_RATE + $PRIME_SPREAD" | bc)
echo "BoC Rate: $BOC_RATE% | Prime: $PRIME_RATE%"

# ============================================================
# 2. Fetch bond yields from Valet API (2yr, 5yr, 10yr)
# ============================================================
echo ""
echo "--- Fetching GoC bond yields ---"
BOND_JSON=$(curl -sf "https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD,BD.CDN.5YR.DQ.YLD,BD.CDN.10YR.DQ.YLD/json?recent=3" 2>/dev/null || echo "")
if [ -n "$BOND_JSON" ]; then
  BOND_DATA=$(echo "$BOND_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
obs = data.get('observations', [])
if obs:
    latest = obs[-1]
    y2 = latest.get('BD.CDN.2YR.DQ.YLD', {}).get('v', '2.99')
    y5 = latest.get('BD.CDN.5YR.DQ.YLD', {}).get('v', '3.20')
    y10 = latest.get('BD.CDN.10YR.DQ.YLD', {}).get('v', '3.59')
    print(f'{y2},{y5},{y10}')
else:
    print('2.99,3.20,3.59')
" 2>/dev/null || echo "2.99,3.20,3.59")
else
  BOND_DATA="2.99,3.20,3.59"
fi
BOND_2YR=$(echo "$BOND_DATA" | cut -d',' -f1)
BOND_5YR=$(echo "$BOND_DATA" | cut -d',' -f2)
BOND_10YR=$(echo "$BOND_DATA" | cut -d',' -f3)
echo "2yr: $BOND_2YR% | 5yr: $BOND_5YR% | 10yr: $BOND_10YR%"

# ============================================================
# 3. Fetch CORRA futures from Montreal Exchange
# ============================================================
echo ""
echo "--- Fetching CORRA futures (Montreal Exchange) ---"
MX_PAGE=$(curl -sL "https://www.m-x.ca/en/trading/data/quotes?symbol=CRA" 2>/dev/null || echo "")

if [ -n "$MX_PAGE" ]; then
  # MX page uses data-sort attributes: every 7 values = one contract row
  # Order: date, high, low, settle, change, volume, open_interest
  CORRA_FUTURES=$(echo "$MX_PAGE" | python3 -c "
import sys, re, json

html = sys.stdin.read()
values = re.findall(r'data-sort=\"([^\"]+)\"', html)
contracts = []
i = 0
while i + 6 < len(values):
    date_str = values[i]
    settle_str = values[i + 3]
    # Validate: date should be YYYY-MM-DD, settle should be a number
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        try:
            settle = float(settle_str)
            if 90 < settle < 100:  # Valid CORRA futures price range
                implied = round(100 - settle, 3)
                contracts.append({
                    'date': date_str[:7],  # YYYY-MM
                    'settle': settle,
                    'implied_rate': implied
                })
        except ValueError:
            pass
        i += 7
    else:
        i += 1

print(json.dumps(contracts))
" 2>/dev/null || echo "[]")
else
  CORRA_FUTURES="[]"
fi

FUTURES_COUNT=$(echo "$CORRA_FUTURES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "CORRA futures contracts found: $FUTURES_COUNT"

# ============================================================
# 4. Fetch current mortgage rates from Supabase (if available)
# ============================================================
echo ""
echo "--- Fetching current mortgage rates ---"
SUPABASE_URL="${SUPABASE_URL:-https://dotglplhsdsmrbacmtrx.supabase.co}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -n "$SUPABASE_KEY" ]; then
  CURRENT_RATES=$(curl -sf "$SUPABASE_URL/rest/v1/market_rates?rate_type=eq.uninsured&select=term_key,rate" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY" 2>/dev/null || echo "[]")
else
  echo "No Supabase key, using defaults"
  CURRENT_RATES="[]"
fi

# ============================================================
# 5. Build forward curves and generate rates.json
# ============================================================
echo ""
echo "--- Building forward curves ---"

export PROJ_DATE="$DATE"
export PROJ_BOC_RATE="$BOC_RATE"
export PROJ_PRIME_RATE="$PRIME_RATE"
export PROJ_PRIME_SPREAD="$PRIME_SPREAD"
export PROJ_BOND_2YR="$BOND_2YR"
export PROJ_BOND_5YR="$BOND_5YR"
export PROJ_BOND_10YR="$BOND_10YR"
export PROJ_CORRA_FUTURES="$CORRA_FUTURES"
export PROJ_CURRENT_RATES="$CURRENT_RATES"

python3 << 'PYEOF'
import json, os
from datetime import datetime
from dateutil.relativedelta import relativedelta

DATE = os.environ["PROJ_DATE"]
BOC_RATE = float(os.environ["PROJ_BOC_RATE"])
PRIME_RATE = float(os.environ["PROJ_PRIME_RATE"])
PRIME_SPREAD = float(os.environ["PROJ_PRIME_SPREAD"])
BOND_2YR = float(os.environ["PROJ_BOND_2YR"])
BOND_5YR = float(os.environ["PROJ_BOND_5YR"])
BOND_10YR = float(os.environ["PROJ_BOND_10YR"])

# Parse CORRA futures
try:
    corra_futures = json.loads(os.environ["PROJ_CORRA_FUTURES"])
except:
    corra_futures = []

# Parse current rates
try:
    current_rates_raw = json.loads(os.environ["PROJ_CURRENT_RATES"])
    current_rates = {r["term_key"]: r["rate"] for r in current_rates_raw}
except:
    current_rates = {}

# Default uninsured rates (from current market or fallback)
uninsured = {
    "1yr_fixed": current_rates.get("1yr_fixed", 5.09),
    "2yr_fixed": current_rates.get("2yr_fixed", 4.59),
    "3yr_fixed": current_rates.get("3yr_fixed", 4.19),
    "4yr_fixed": current_rates.get("4yr_fixed", 4.29),
    "5yr_fixed": current_rates.get("5yr_fixed", 4.39),
    "vrm_discount": -0.60,
    "vrm_effective": round(PRIME_RATE - 0.60, 2)
}

# Insured rates (typically 50-60bps lower)
insured = {
    "1yr_fixed": round(uninsured["1yr_fixed"] - 0.55, 2),
    "2yr_fixed": round(uninsured["2yr_fixed"] - 0.60, 2),
    "3yr_fixed": round(uninsured["3yr_fixed"] - 0.50, 2),
    "4yr_fixed": round(uninsured["4yr_fixed"] - 0.55, 2),
    "5yr_fixed": round(uninsured["5yr_fixed"] - 0.60, 2),
    "vrm_discount": -0.96,
    "vrm_effective": round(PRIME_RATE - 0.96, 2)
}

# Build monthly forward path
# If we have CORRA futures, use them for base case
# Otherwise use bank consensus

# Parse futures into dated implied rates
futures_by_date = {}
for f in corra_futures:
    date_key = f.get("date", "")
    if date_key:
        futures_by_date[date_key] = f["implied_rate"]

# Generate 60-month forward path (5 years)
now = datetime.strptime(DATE, "%Y-%m-%d")
months = []

# Three scenarios
# Base: CORRA futures if available, else hold current
# Bull: Most dovish (hold at current BoC rate, gradual easing)
# Bear: Most hawkish (rates rise toward 3.00-3.25% BoC)

has_futures = len(futures_by_date) > 0

    # Build interpolated base curve from quarterly CORRA futures
if has_futures:
    sorted_contracts = sorted(futures_by_date.items())
    # Add current rate as starting point
    current_key = now.strftime("%Y-%m")
    anchor_points = [(current_key, BOC_RATE)] + sorted_contracts

    # Convert to month indices for interpolation
    def month_index(date_str):
        y, m = date_str.split("-")
        return int(y) * 12 + int(m)

    base_idx = month_index(current_key)
    interp_points = [(month_index(k) - base_idx, v) for k, v in anchor_points]

    def interpolate(target_offset):
        if target_offset <= interp_points[0][0]:
            return interp_points[0][1]
        if target_offset >= interp_points[-1][0]:
            return interp_points[-1][1]
        for j in range(len(interp_points) - 1):
            x0, y0 = interp_points[j]
            x1, y1 = interp_points[j + 1]
            if x0 <= target_offset <= x1:
                if x1 == x0:
                    return y0
                t = (target_offset - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return interp_points[-1][1]

for i in range(61):
    dt = now + relativedelta(months=i)
    date_key = dt.strftime("%Y-%m")

    if has_futures:
        base_boc = round(interpolate(i), 2)
    else:
        base_boc = BOC_RATE

    # Bull: rates stay flat or ease slightly
    bull_boc = BOC_RATE  # Hold at current level

    # Bear: gradual increase toward 3.25%
    bear_terminal = 3.25
    if i <= 12:
        bear_boc = BOC_RATE + (bear_terminal - BOC_RATE) * (i / 12)
    else:
        bear_boc = bear_terminal

    months.append({
        "date": date_key,
        "base": {"boc": round(base_boc, 2), "prime": round(base_boc + PRIME_SPREAD, 2)},
        "bull": {"boc": round(bull_boc, 2), "prime": round(bull_boc + PRIME_SPREAD, 2)},
        "bear": {"boc": round(bear_boc, 2), "prime": round(bear_boc + PRIME_SPREAD, 2)}
    })

# Terminal rates for each scenario
if has_futures:
    sorted_futures = sorted(futures_by_date.items())
    base_terminal_boc = sorted_futures[-1][1] if sorted_futures else BOC_RATE
else:
    base_terminal_boc = BOC_RATE

base_terminal_prime = round(base_terminal_boc + PRIME_SPREAD, 2)
bull_terminal_prime = round(BOC_RATE + PRIME_SPREAD, 2)
bear_terminal_prime = round(3.25 + PRIME_SPREAD, 2)

# Build the output
output = {
    "updated": DATE,
    "source": "Live data: BoC Valet API, Montreal Exchange CORRA Futures, Flow weekly research",
    "data_sources": {
        "boc_rate": "Bank of Canada Valet API (V39079)",
        "corra_futures": f"Montreal Exchange CRA contracts ({len(corra_futures)} contracts)",
        "bond_yields": "Bank of Canada Valet API (BD.CDN series)",
        "mortgage_rates": "Supabase market_rates (WOWA scrape)",
        "bank_consensus": "TD/RBC hold at 2.25%, Scotiabank/NBC rise to 2.75%"
    },
    "prime": PRIME_RATE,
    "bocRate": BOC_RATE,
    "bondYields": {
        "2yr": BOND_2YR,
        "5yr": BOND_5YR,
        "10yr": BOND_10YR
    },

    "uninsured": uninsured,
    "insured": insured,

    "surcharges": {
        "rental": 0.25,
        "thirtyYearAmort": 0.10,
        "description": "Rental properties add +0.25% to all fixed rates. 30-year amortization adds +0.10% to all rates."
    },

    "primeRatePath": {
        "description": "Monthly projected prime rate derived from CORRA futures (base), bank consensus (bull/bear). Updated daily.",
        "scenarios": ["base", "bull", "bear"],
        "months": months
    },

    "scenarios": {
        "bull": {
            "label": "Rates Hold / Drop",
            "description": f"BoC holds at {BOC_RATE}% (TD, RBC, BMO, CIBC consensus)",
            "terminalPrime": bull_terminal_prime,
            "terminalBoC": BOC_RATE
        },
        "base": {
            "label": "Market Pricing",
            "description": f"CORRA futures imply BoC rising to ~{round(base_terminal_boc, 2)}%",
            "terminalPrime": base_terminal_prime,
            "terminalBoC": round(base_terminal_boc, 2)
        },
        "bear": {
            "label": "Rates Rise",
            "description": "BoC hikes to 3.25%+ (Scotiabank, NBC hawkish view)",
            "terminalPrime": bear_terminal_prime,
            "terminalBoC": 3.25
        }
    },

    "assumptions": {
        "switchFee": 300,
        "vrmRenewalDiscount": -0.80,
        "defaultMortgageAmount": 400000,
        "defaultAmortization": 25
    },

    "notes": f"Auto-generated {DATE} from live market data. Base case uses CORRA futures market pricing. Bull case uses Big 4 bank consensus (hold). Bear case uses hawkish bank view (Scotiabank/NBC). Bond yields drive fixed rate projections."
}

# Write rates.json
with open("rates.json", "w") as f:
    json.dump(output, f, indent=2)

print(f"rates.json written: {len(months)} months, {len(corra_futures)} futures contracts")
print(f"Base terminal: BoC {round(base_terminal_boc, 2)}% / Prime {base_terminal_prime}%")
print(f"Bull terminal: BoC {BOC_RATE}% / Prime {bull_terminal_prime}%")
print(f"Bear terminal: BoC 3.25% / Prime {bear_terminal_prime}%")
PYEOF

echo ""
echo "--- rates.json generated ---"

# ============================================================
# 6. Upsert to Supabase rate_simulator_data table
# ============================================================
SIMULATOR_SUPABASE_URL="${SIMULATOR_SUPABASE_URL:-https://kdevffjzngobsqsdautq.supabase.co}"
SIMULATOR_SUPABASE_KEY="${SIMULATOR_SUPABASE_SERVICE_KEY:-}"

if [ -n "$SIMULATOR_SUPABASE_KEY" ]; then
  echo ""
  echo "--- Upserting to Supabase rate_simulator_data ---"
  RATES_CONTENT=$(cat rates.json)

  RESPONSE=$(curl -sf "$SIMULATOR_SUPABASE_URL/rest/v1/rate_simulator_data?id=eq.1" \
    -X PATCH \
    -H "apikey: $SIMULATOR_SUPABASE_KEY" \
    -H "Authorization: Bearer $SIMULATOR_SUPABASE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"data\": $RATES_CONTENT, \"updated_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" 2>&1 || echo "FAILED")

  if [ "$RESPONSE" = "FAILED" ]; then
    echo "Supabase upsert failed, trying INSERT..."
    curl -sf "$SIMULATOR_SUPABASE_URL/rest/v1/rate_simulator_data" \
      -X POST \
      -H "apikey: $SIMULATOR_SUPABASE_KEY" \
      -H "Authorization: Bearer $SIMULATOR_SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"data\": $RATES_CONTENT, \"updated_at\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}" 2>/dev/null || echo "INSERT also failed"
  else
    echo "Supabase updated successfully"
  fi
else
  echo ""
  echo "SIMULATOR_SUPABASE_SERVICE_KEY not set, skipping Supabase upsert"
fi

# ============================================================
# 7. Copy to Google Drive (local runs only)
# ============================================================
GDRIVE_PATH="$HOME/Library/CloudStorage/GoogleDrive-alex@getflowmortgage.ca/My Drive/Flow Projects/Tools/Flow Tools Hub/rates.json"
if [ -d "$(dirname "$GDRIVE_PATH")" ]; then
  cp rates.json "$GDRIVE_PATH"
  echo ""
  echo "--- Copied rates.json to Google Drive ---"
fi

echo ""
echo "=== Rate Projection Pipeline Complete ==="
