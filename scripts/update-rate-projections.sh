#!/bin/bash
# Rate Projection Pipeline
# Fetches live Canadian rate data and builds forward curves for Rate Simulator
# Sources: BoC Valet API, Montreal Exchange CORRA futures, Supabase market_rates
# Outputs: rates.json with bull/base/bear scenarios
# Schedule: Daily at 8:30 AM ET via GitHub Actions

set -euo pipefail

DATE=$(date -u +"%Y-%m-%d")
PRIME_SPREAD=2.20  # Prime = BoC + 2.20%
BROKER_SPREAD=0.50  # WOWA best rates run ~50bps below actual broker rates Flow quotes

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
export PROJ_BROKER_SPREAD="$BROKER_SPREAD"

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
BROKER_SPREAD = float(os.environ.get("PROJ_BROKER_SPREAD", "0.30"))

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

# ============================================================
# Sanity check: reject garbage from upstream scraper
# WOWA regex is fragile and sometimes grabs the wrong number.
# Rule of thumb: uninsured pre-spread rate should be >= BoC + 1.0
# (e.g. BoC 2.25% -> uninsured best rates floor at 3.25%)
# If any term fails, fall back to the last known good rates.json on disk
# and mark the run as stale so the alert step fires.
# ============================================================
RATE_FLOOR = BOC_RATE + 1.0
CURRENT_KEYS = ["1yr_fixed","2yr_fixed","3yr_fixed","4yr_fixed","5yr_fixed"]
rates_stale = False
stale_reason = ""

def load_last_good():
    try:
        with open("rates.json") as f:
            prev = json.load(f)
        u = prev.get("uninsured") or {}
        # Only trust previous file if it itself passes sanity
        if all(u.get(k, 0) >= RATE_FLOOR for k in CURRENT_KEYS):
            return u, prev.get("insured")
        return None, None
    except Exception:
        return None, None

def conservative_defaults():
    """Last-resort safe defaults when upstream AND previous file are both garbage.
    Calibrated to BoC+2.5 for 5yr (realistic broker floor)."""
    five = round(BOC_RATE + 2.5, 2)
    return {
        "1yr_fixed": round(five + 0.45, 2),
        "2yr_fixed": round(five + 0.00, 2),
        "3yr_fixed": round(five - 0.40, 2),
        "4yr_fixed": round(five - 0.20, 2),
        "5yr_fixed": five,
        "vrm_discount": -0.60,
        "vrm_effective": round(PRIME_RATE - 0.60, 2)
    }

bad = [k for k in CURRENT_KEYS if k in current_rates and current_rates[k] < RATE_FLOOR]
missing_all = not any(k in current_rates for k in CURRENT_KEYS)

if bad or missing_all:
    rates_stale = True
    stale_reason = f"upstream scraper failed sanity check: bad={bad} missing_all={missing_all} floor={RATE_FLOOR}"
    print(f"WARN: {stale_reason}")
    last_uninsured, last_insured = load_last_good()
    if last_uninsured:
        print("Using last-known-good uninsured rates from previous rates.json (passed sanity)")
        uninsured = dict(last_uninsured)
        uninsured["vrm_effective"] = round(PRIME_RATE - 0.60, 2)
    else:
        print("Previous rates.json missing or itself failed sanity, using conservative hardcoded defaults")
        uninsured = conservative_defaults()
else:
    # Normal path: build from current_rates + broker spread
    BS = BROKER_SPREAD
    uninsured = {
        "1yr_fixed": round(current_rates.get("1yr_fixed", 5.09) + BS, 2),
        "2yr_fixed": round(current_rates.get("2yr_fixed", 4.59) + BS, 2),
        "3yr_fixed": round(current_rates.get("3yr_fixed", 4.19) + BS, 2),
        "4yr_fixed": round(current_rates.get("4yr_fixed", 4.29) + BS, 2),
        "5yr_fixed": round(current_rates.get("5yr_fixed", 4.39) + BS, 2),
        "vrm_discount": -0.60,
        "vrm_effective": round(PRIME_RATE - 0.60, 2)
    }

# Second-pass guardrail: enforce floor even after all the math
# (catches the case where raw + spread still produces nonsense)
for k in CURRENT_KEYS:
    if uninsured[k] < RATE_FLOOR:
        print(f"WARN: {k}={uninsured[k]} below floor {RATE_FLOOR}, clamping")
        uninsured[k] = round(RATE_FLOOR, 2)
        rates_stale = True
        stale_reason = stale_reason or f"post-spread clamp on {k}"

# Insured rates (typically 50-60bps lower than uninsured)
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
# Priority: CORRA futures > bank consensus fallback
# Scenarios reflect actual market views, not generic bull/base/bear

# Parse futures into dated implied rates
futures_by_date = {}
for f in corra_futures:
    date_key = f.get("date", "")
    if date_key:
        futures_by_date[date_key] = f["implied_rate"]

# Generate 60-month forward path (5 years)
now = datetime.strptime(DATE, "%Y-%m-%d")
months = []

has_futures = len(futures_by_date) > 0

# ---- Bank consensus BoC meeting schedule (used when CORRA empty) ----
# OIS/bank consensus as of Apr 2026:
#   Market pricing: ~50bps hikes H2 2026, ~25bps 2027 (BoC to 3.00%)
#   TD/BMO: hold at current (dovish)
#   RBC/Scotiabank: hike to 3.25% by end 2027 (hawkish)
#
# Meeting months (approximate): Jan, Mar, Apr, Jun, Jul, Sep, Oct, Dec
# Base hike schedule: +25bps Jul 2026, +25bps Oct 2026, +25bps Jun 2027
# Bear hike schedule: base + extra hikes Mar 2027, Oct 2027 (+25bps each)

# Build anchor points for base case from bank consensus
def build_consensus_base(start_date, boc_now):
    """Market-implied path: ~50bps H2 2026, ~25bps 2027"""
    anchors = []
    hike_schedule = [
        ("2026-07", 0.25),  # Jul 2026 meeting
        ("2026-10", 0.25),  # Oct 2026 meeting
        ("2027-06", 0.25),  # Jun 2027 meeting
    ]
    cumulative = 0.0
    for date_str, delta in hike_schedule:
        cumulative += delta
        anchors.append((date_str, boc_now + cumulative))
    return anchors, boc_now + cumulative  # anchors + terminal

def build_consensus_bear(start_date, boc_now):
    """Hawkish path: BoC to 3.25% by end 2027 (RBC/Scotiabank)"""
    anchors = []
    hike_schedule = [
        ("2026-07", 0.25),
        ("2026-10", 0.25),
        ("2027-03", 0.25),
        ("2027-07", 0.25),
        ("2027-12", 0.25),
    ]
    cumulative = 0.0
    for date_str, delta in hike_schedule:
        cumulative += delta
        anchors.append((date_str, boc_now + cumulative))
    terminal = min(boc_now + cumulative, 3.50)
    return anchors, terminal

# Month-index helpers
def month_index(date_str):
    y, m = date_str.split("-")
    return int(y) * 12 + int(m)

current_key = now.strftime("%Y-%m")
base_idx = month_index(current_key)

def make_interpolator(anchor_points_raw):
    """Build interpolation from anchor points (date_str, boc_rate)"""
    pts = [(0, BOC_RATE)]  # start at current
    for date_str, rate in anchor_points_raw:
        offset = month_index(date_str) - base_idx
        if offset > 0:
            pts.append((offset, rate))
    # Sort and dedupe
    pts = sorted(set(pts))

    def interp(i):
        if i <= pts[0][0]: return pts[0][1]
        if i >= pts[-1][0]: return pts[-1][1]
        for j in range(len(pts) - 1):
            x0, y0 = pts[j]
            x1, y1 = pts[j + 1]
            if x0 <= i <= x1:
                if x1 == x0: return y0
                t = (i - x0) / (x1 - x0)
                return y0 + t * (y1 - y0)
        return pts[-1][1]
    return interp

# Build interpolators
if has_futures:
    sorted_contracts = sorted(futures_by_date.items())
    corra_anchors = [(k, v) for k, v in sorted_contracts]
    base_interp = make_interpolator(corra_anchors)
    base_terminal_boc = sorted_contracts[-1][1]
else:
    consensus_anchors, base_terminal_boc = build_consensus_base(now, BOC_RATE)
    base_interp = make_interpolator(consensus_anchors)

bear_anchors, bear_terminal_boc = build_consensus_bear(now, BOC_RATE)
bear_interp = make_interpolator(bear_anchors)

for i in range(61):
    dt = now + relativedelta(months=i)
    date_key = dt.strftime("%Y-%m")

    base_boc = round(base_interp(i), 2)
    bull_boc = BOC_RATE  # Hold at current (TD/BMO dovish view)
    bear_boc = round(bear_interp(i), 2)

    months.append({
        "date": date_key,
        "base": {"boc": base_boc, "prime": round(base_boc + PRIME_SPREAD, 2)},
        "bull": {"boc": bull_boc, "prime": round(bull_boc + PRIME_SPREAD, 2)},
        "bear": {"boc": bear_boc, "prime": round(bear_boc + PRIME_SPREAD, 2)}
    })

# Build base case prime rate path in simulator-compatible format
prime_rate_path_months = []
for m in months:
    entry = {"date": m["date"], "prime": m["base"]["prime"], "boc": m["base"]["boc"]}
    prime_rate_path_months.append(entry)

base_terminal_prime = round(base_terminal_boc + PRIME_SPREAD, 2)
bull_terminal_prime = round(BOC_RATE + PRIME_SPREAD, 2)
bear_terminal_prime = round(bear_terminal_boc + PRIME_SPREAD, 2)

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
        "description": "Monthly projected prime rate for base case. Derived from CORRA futures or bank consensus when futures unavailable.",
        "scenario": "base",
        "months": prime_rate_path_months
    },

    "scenarios": {
        "bull": {
            "label": "Rates Hold",
            "terminalPrime": bull_terminal_prime,
            "terminalBoC": BOC_RATE,
            "description": f"BoC holds at {BOC_RATE}% indefinitely (TD, BMO dovish view). Prime stays at {bull_terminal_prime}%."
        },
        "base": {
            "label": "Market Pricing",
            "terminalPrime": base_terminal_prime,
            "terminalBoC": round(base_terminal_boc, 2),
            "description": f"{'CORRA futures' if has_futures else 'OIS/bank consensus'}-implied: BoC to {round(base_terminal_boc, 2)}%, prime to {base_terminal_prime}%."
        },
        "bear": {
            "label": "Rates Rise More",
            "terminalPrime": bear_terminal_prime,
            "terminalBoC": round(bear_terminal_boc, 2),
            "description": f"BoC hikes to {round(bear_terminal_boc, 2)}% (RBC, Scotiabank hawkish view). Prime to {bear_terminal_prime}%."
        }
    },

    "assumptions": {
        "switchFee": 300,
        "vrmRenewalDiscount": -0.80,
        "defaultMortgageAmount": 400000,
        "defaultAmortization": 25
    },

    "notes": f"Auto-generated {DATE}. Base = {'CORRA futures' if has_futures else 'OIS/bank consensus'} ({round(base_terminal_boc, 2)}% terminal). Bull = TD/BMO dovish hold. Bear = RBC/Scotiabank hawkish ({round(bear_terminal_boc, 2)}% terminal). Forward curve uses step function at BoC meeting months.",

    "rates_stale": rates_stale,
    "stale_reason": stale_reason if rates_stale else None
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
