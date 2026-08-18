#!/usr/bin/env bash
# Flow Rate Intelligence — Weekly Briefing Email
# Fetches live rates from the brain MLN intelligence endpoint, builds HTML email,
# sends via Resend.
# Requires: RESEND_API_KEY env var
#
# SOURCE OF TRUTH (2026-08-17): every rate in this email comes from
# jkeuj/functions/v1/mln-intelligence.
#   - Flow's own displayed rates  = comparison[].flow_spotlight (brain market_rates,
#     written by /rate-update from Alex's broker sheet)
#   - best-of-market comparison   = MLN best insured/uninsured
# Until 2026-08-17 section 1 read market_rates on the DEAD Lovable project
# dotglplhsdsmrbacmtrx, which froze on 2026-04-13 and mailed the team a 3.10%
# 5yr fixed sourced "WOWA.ca" for four months (real displayed 5yr: 4.79). That
# project is not in Alex's org, returned HTTP 200 forever, and WOWA is a banned
# source. Do not reintroduce it.
#
# This script now FAILS LOUDLY. A briefing that cannot verify its rates sends
# nothing, because a silent fallback is what hid the bug for four months.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INTEL_URL="${INTEL_URL:-https://jkeujqzlclrxhwamplby.supabase.co/functions/v1/mln-intelligence}"
MAX_RATE_AGE_DAYS=21
RESEND_KEY="${RESEND_API_KEY:?RESEND_API_KEY required}"
DATA_FILE="$SCRIPT_DIR/rate-intel-data.json"
TEMPLATE_FILE="$SCRIPT_DIR/rate-briefing-template.html"

BRIEFING_DATE=$(TZ="America/Toronto" date +"%B %-d, %Y")
BRIEFING_TIME=$(TZ="America/Toronto" date +"%-I:%M %p")

echo "=== Flow Rate Intelligence Briefing ==="
echo "Date: $BRIEFING_DATE $BRIEFING_TIME ET"

die() { echo "ABORT: $*" >&2; echo "No briefing sent." >&2; exit 1; }

# ── 1. Fetch live rates from the brain intelligence endpoint ──
echo ""
echo "Fetching rates from mln-intelligence..."
MLN_JSON=$(curl -sf -m 20 "$INTEL_URL") \
  || die "mln-intelligence unreachable. The team gets no rate table rather than a stale one."

echo "$MLN_JSON" | jq -e '.comparison' >/dev/null 2>&1 \
  || die "mln-intelligence returned no comparison block."

# Flow's own DISPLAYED rate per term (broker sheet via /rate-update), not market best.
flow_rate() {
  echo "$MLN_JSON" | jq -r --arg t "$1" \
    '(.comparison[] | select(.term==$t) | .flow_spotlight) // empty'
}

RATE_1YR=$(flow_rate "1")
RATE_2YR=$(flow_rate "2")
RATE_3YR=$(flow_rate "3")
RATE_4YR=$(flow_rate "4")
RATE_5YR_FIXED=$(flow_rate "5")
RATE_5YR_VAR=$(flow_rate "var")
RATE_10YR=$(flow_rate "10")

# Every term must be present and plausible. No defaults, no last-known-good.
for pair in "1yr:$RATE_1YR" "2yr:$RATE_2YR" "3yr:$RATE_3YR" "4yr:$RATE_4YR" \
            "5yr:$RATE_5YR_FIXED" "5yr_var:$RATE_5YR_VAR" "10yr:$RATE_10YR"; do
  label="${pair%%:*}"; value="${pair#*:}"
  [ -n "$value" ] || die "no Flow displayed rate for $label."
  awk -v v="$value" 'BEGIN{exit !(v+0 >= 0.5 && v+0 <= 15)}' \
    || die "implausible $label rate: $value"
done

RATE_SOURCE="Flow broker rate sheet (displayed)"
RATE_UPDATED=$(echo "$MLN_JSON" | jq -r '.flow_updated_at // empty' | cut -dT -f1)
[ -n "$RATE_UPDATED" ] || die "mln-intelligence returned no flow_updated_at stamp."

# Staleness gate. A frozen broker sheet is exactly the failure this replaces.
RATE_AGE_DAYS=$(( ( $(date -u +%s) - $(date -u -d "$RATE_UPDATED" +%s 2>/dev/null \
                    || date -u -j -f "%Y-%m-%d" "$RATE_UPDATED" +%s) ) / 86400 ))
[ "$RATE_AGE_DAYS" -le "$MAX_RATE_AGE_DAYS" ] \
  || die "Flow rates are ${RATE_AGE_DAYS}d old (limit ${MAX_RATE_AGE_DAYS}d). Run /rate-update."

echo "  1yr: $RATE_1YR | 2yr: $RATE_2YR | 3yr: $RATE_3YR"
echo "  4yr: $RATE_4YR | 5yr fixed: $RATE_5YR_FIXED | 5yr var: $RATE_5YR_VAR"
echo "  10yr: $RATE_10YR | Source: $RATE_SOURCE (${RATE_AGE_DAYS}d old)"

# ── 2. Calculate program rates ──
# Insured = uninsured - 0.10, Insurable = uninsured - 0.05
INSURED_ADJ=$(jq -r '.programs.insured.rate_adjustment' "$DATA_FILE")
INSURABLE_ADJ=$(jq -r '.programs.insurable.rate_adjustment' "$DATA_FILE")
RATE_INSURED=$(echo "$RATE_5YR_FIXED + $INSURED_ADJ" | bc)
RATE_INSURABLE=$(echo "$RATE_5YR_FIXED + $INSURABLE_ADJ" | bc)

echo "  Insured 5yr: $RATE_INSURED | Insurable 5yr: $RATE_INSURABLE"

# ── 2b. MLN market intelligence: Flow vs best-of-market + bond/news ──
# Same MLN_JSON already fetched and validated in section 1 — one call, one source.
echo ""
echo "Building market position from MLN..."
MARKET_POSITION=""
RATE_NEWS=""

echo "$MLN_JSON" | jq -e '.best.uninsured["5"]' >/dev/null 2>&1 \
  || die "mln-intelligence returned no best-of-market 5yr."

if true; then
  MLN_LENDERS=$(echo "$MLN_JSON" | jq -r '.lender_count // "—"')
  echo "  MLN best 5yr: $(echo "$MLN_JSON" | jq -r '.best.uninsured["5"]') | lenders: $MLN_LENDERS"

  MARKET_ROWS=""
  add_market_row() {
    local label="$1" flow="$2" mb="$3"
    { [ -z "$mb" ] || [ "$mb" = "null" ] || [ -z "$flow" ] || [ "$flow" = "null" ]; } && return 0
    local gap sign color
    # gap in bps, rounded; + = Flow above the sharpest market rate
    gap=$(awk -v f="$flow" -v m="$mb" 'BEGIN{d=(f-m)*100; printf "%d", d + (d>=0?0.5:-0.5)}')
    if [ "$gap" -lt 0 ]; then sign=""; color="#10b981"; else sign="+"; color="#f59e0b"; fi
    MARKET_ROWS="${MARKET_ROWS}
    <tr>
      <td style=\"padding:11px 16px;font-size:13px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;\">${label}</td>
      <td style=\"padding:11px 16px;font-size:14px;font-weight:700;color:#0f1629;text-align:center;border-bottom:1px solid #f1f5f9;\">${flow}%</td>
      <td style=\"padding:11px 16px;font-size:14px;font-weight:700;color:#06b6d4;text-align:center;border-bottom:1px solid #f1f5f9;\">${mb}%</td>
      <td style=\"padding:11px 16px;font-size:13px;font-weight:700;color:${color};text-align:center;border-bottom:1px solid #f1f5f9;\">${sign}${gap} bps</td>
    </tr>"
  }
  add_market_row "1-Year Fixed"    "$RATE_1YR"       "$(echo "$MLN_JSON" | jq -r '.best.uninsured["1"]  // "null"')"
  add_market_row "2-Year Fixed"    "$RATE_2YR"       "$(echo "$MLN_JSON" | jq -r '.best.uninsured["2"]  // "null"')"
  add_market_row "3-Year Fixed"    "$RATE_3YR"       "$(echo "$MLN_JSON" | jq -r '.best.uninsured["3"]  // "null"')"
  add_market_row "4-Year Fixed"    "$RATE_4YR"       "$(echo "$MLN_JSON" | jq -r '.best.uninsured["4"]  // "null"')"
  add_market_row "5-Year Fixed"    "$RATE_5YR_FIXED" "$(echo "$MLN_JSON" | jq -r '.best.uninsured["5"]  // "null"')"
  add_market_row "5-Year Variable" "$RATE_5YR_VAR"   "$(echo "$MLN_JSON" | jq -r '.best.uninsured.var    // "null"')"
  add_market_row "10-Year Fixed"   "$RATE_10YR"      "$(echo "$MLN_JSON" | jq -r '.best.uninsured["10"] // "null"')"

  MARKET_POSITION="
  <tr>
  <td style=\"padding:24px 40px 16px;\">
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
    <tr><td style=\"font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#06b6d4;padding-bottom:16px;\">Flow vs Best-of-Market &mdash; BC (${MLN_LENDERS} lenders)</td></tr>
    </table>
    <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;\">
    <tr style=\"background:#f8fafc;\">
      <td style=\"padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;\">Term</td>
      <td style=\"padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;text-align:center;\">Flow</td>
      <td style=\"padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;text-align:center;\">Market Best</td>
      <td style=\"padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;text-align:center;\">Gap</td>
    </tr>${MARKET_ROWS}
    </table>
    <div style=\"font-size:11px;color:#94a3b8;margin-top:8px;line-height:1.4;\">Flow's posted rate vs the sharpest broker-channel rate on MortgageLogic.News. A positive gap flags room a sharper lender could undercut us &mdash; a prompt to shop the file, not a rate to quote.</div>
  </td>
  </tr>"

  # This Week in Rates — bond alerts + rate updates first, then features/externals
  # Bond alerts + rate updates first, then features/externals. Keep only real
  # http links (drops mln:// deep-links), and tidy MLN's float artifacts
  # (e.g. "10.000000000000009bps" -> "10bps").
  NEWS_ROWS=$(echo "$MLN_JSON" | jq -r '
    ([.news[] | select(.type=="bond_alert" or .type=="rate_update")]
     + [.news[] | select(.type=="feature" or .type=="external")])
    | map(select((.url // "") | test("^https?://")))
    | unique_by(.headline) | .[0:5][]
    | "<tr><td style=\"padding:12px 0;border-bottom:1px solid #f1f5f9;\"><a href=\"\(.url)\" style=\"font-size:13px;font-weight:600;color:#0f1629;text-decoration:none;\">" + (.headline|gsub("(?<i>[0-9]+)\\.0{4,}[0-9]+";"\(.i)")|gsub("&";"&amp;")|gsub("<";"&lt;")) + "</a><div style=\"font-size:11px;color:#94a3b8;margin-top:3px;\">" + ((.category // .type) + " &middot; " + (.source // "MLN")) + "</div></td></tr>"
  ' 2>/dev/null || echo "")

  if [ -n "$NEWS_ROWS" ]; then
    RATE_NEWS="
    <tr>
    <td style=\"padding:24px 40px 16px;\">
      <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">
      <tr><td style=\"font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#06b6d4;padding-bottom:8px;\">This Week in Rates</td></tr>
      </table>
      <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">${NEWS_ROWS}
      </table>
      <div style=\"font-size:11px;color:#94a3b8;margin-top:8px;\">Bond moves &amp; rate commentary &mdash; MortgageLogic.News</div>
    </td>
    </tr>"
  fi
fi

# ── 3. Build lender rows ──
echo ""
echo "Building lender matrix..."
LENDER_COUNT=$(jq '.lenders | length' "$DATA_FILE")
LENDER_ROWS=""

for i in $(seq 0 $((LENDER_COUNT - 1))); do
  NAME=$(jq -r ".lenders[$i].name" "$DATA_FILE")
  TYPE=$(jq -r ".lenders[$i].type" "$DATA_FILE")
  POSTED=$(jq -r ".lenders[$i].posted_5yr_fixed // \"N/A\"" "$DATA_FILE")
  PENALTY=$(jq -r ".lenders[$i].penalty_method" "$DATA_FILE")
  SEVERITY=$(jq -r ".lenders[$i].penalty_severity" "$DATA_FILE")
  ADVANTAGE=$(jq -r ".lenders[$i].flow_advantage" "$DATA_FILE")

  # Format posted rate
  if [ "$POSTED" = "null" ] || [ "$POSTED" = "N/A" ]; then
    POSTED_DISPLAY="—"
  else
    POSTED_DISPLAY="${POSTED}%"
  fi

  # Penalty color
  if [ "$SEVERITY" = "severe" ]; then
    PENALTY_COLOR="#ef4444"
  elif [ "$SEVERITY" = "moderate" ]; then
    PENALTY_COLOR="#f59e0b"
  else
    PENALTY_COLOR="#10b981"
  fi

  # Type badge color
  if [ "$TYPE" = "Big 5" ]; then
    TYPE_COLOR="#64748b"
  else
    TYPE_COLOR="#06b6d4"
  fi

  # Alternate row bg
  if [ $((i % 2)) -eq 0 ]; then
    ROW_BG="#ffffff"
  else
    ROW_BG="#f8fafc"
  fi

  LENDER_ROWS="${LENDER_ROWS}
  <tr style=\"background:${ROW_BG};\">
    <td style=\"padding:10px 12px;font-size:13px;font-weight:600;color:#1e293b;border-bottom:1px solid #f1f5f9;\">${NAME}</td>
    <td style=\"padding:10px 12px;text-align:center;border-bottom:1px solid #f1f5f9;\"><span style=\"display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;color:#ffffff;background:${TYPE_COLOR};\">${TYPE}</span></td>
    <td style=\"padding:10px 12px;font-size:13px;font-weight:700;color:#1e293b;text-align:center;border-bottom:1px solid #f1f5f9;\">${POSTED_DISPLAY}</td>
    <td style=\"padding:10px 12px;text-align:center;border-bottom:1px solid #f1f5f9;\"><span style=\"font-size:11px;font-weight:600;color:${PENALTY_COLOR};\">${PENALTY}</span></td>
    <td style=\"padding:10px 12px;font-size:11px;color:#475569;line-height:1.4;border-bottom:1px solid #f1f5f9;\">${ADVANTAGE}</td>
  </tr>"
done

# ── 4. Build value prop cards ──
echo "Building value prop cards..."
PROP_COUNT=$(jq '.flow_value_props | length' "$DATA_FILE")
VALUE_PROP_CARDS=""

for i in $(seq 0 $((PROP_COUNT - 1))); do
  TITLE=$(jq -r ".flow_value_props[$i].title" "$DATA_FILE")
  HOOK=$(jq -r ".flow_value_props[$i].hook" "$DATA_FILE")
  PROOF=$(jq -r ".flow_value_props[$i].proof" "$DATA_FILE")
  COLOR=$(jq -r ".flow_value_props[$i].color" "$DATA_FILE")

  VALUE_PROP_CARDS="${VALUE_PROP_CARDS}
  <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-bottom:12px;\">
  <tr><td style=\"padding:16px 20px;background:#f8fafc;border-left:4px solid ${COLOR};border-radius:0 8px 8px 0;\">
    <div style=\"font-size:14px;font-weight:700;color:#0f1629;margin-bottom:6px;\">${TITLE}</div>
    <div style=\"font-size:13px;color:#475569;line-height:1.5;\">${HOOK}</div>
    <div style=\"font-size:12px;color:#06b6d4;font-weight:600;margin-top:8px;\">${PROOF}</div>
  </td></tr>
  </table>"
done

# ── 5. Hydrate template ──
echo "Hydrating email template..."
HTML=$(cat "$TEMPLATE_FILE")
HTML="${HTML//\{\{BRIEFING_DATE\}\}/$BRIEFING_DATE}"
HTML="${HTML//\{\{BRIEFING_TIME\}\}/$BRIEFING_TIME}"
HTML="${HTML//\{\{RATE_1YR\}\}/$RATE_1YR}"
HTML="${HTML//\{\{RATE_2YR\}\}/$RATE_2YR}"
HTML="${HTML//\{\{RATE_3YR\}\}/$RATE_3YR}"
HTML="${HTML//\{\{RATE_4YR\}\}/$RATE_4YR}"
HTML="${HTML//\{\{RATE_5YR_FIXED\}\}/$RATE_5YR_FIXED}"
HTML="${HTML//\{\{RATE_5YR_VAR\}\}/$RATE_5YR_VAR}"
HTML="${HTML//\{\{RATE_10YR\}\}/$RATE_10YR}"
HTML="${HTML//\{\{RATE_SOURCE\}\}/$RATE_SOURCE}"
HTML="${HTML//\{\{RATE_UPDATED\}\}/$RATE_UPDATED}"
HTML="${HTML//\{\{RATE_INSURED\}\}/$RATE_INSURED}"
HTML="${HTML//\{\{RATE_INSURABLE\}\}/$RATE_INSURABLE}"
HTML="${HTML//\{\{LENDER_ROWS\}\}/$LENDER_ROWS}"
HTML="${HTML//\{\{VALUE_PROP_CARDS\}\}/$VALUE_PROP_CARDS}"
HTML="${HTML//\{\{MARKET_POSITION\}\}/$MARKET_POSITION}"
HTML="${HTML//\{\{RATE_NEWS\}\}/$RATE_NEWS}"

# ── 6. Send via Resend ──
echo ""
echo "Sending email via Resend..."
FROM_EMAIL=$(jq -r '.from_email' "$DATA_FILE")
FROM_NAME=$(jq -r '.from_name' "$DATA_FILE")

# Preview mode: TEST_EMAIL set → send only to that address, subject-tagged.
# Otherwise send to the full team list from rate-intel-data.json.
if [ -n "${TEST_EMAIL:-}" ]; then
  RECIPIENTS_JSON=$(jq -n --arg e "$TEST_EMAIL" '[{email:$e, name:"Preview"}]')
  SUBJECT_PREFIX="[TEST] "
  echo "PREVIEW MODE — sending only to $TEST_EMAIL"
else
  RECIPIENTS_JSON=$(jq -c '.team_recipients' "$DATA_FILE")
  SUBJECT_PREFIX=""
fi
RECIPIENT_COUNT=$(echo "$RECIPIENTS_JSON" | jq 'length')
SEND_FAILURES=0

for i in $(seq 0 $((RECIPIENT_COUNT - 1))); do
  TO_EMAIL=$(echo "$RECIPIENTS_JSON" | jq -r ".[$i].email")
  TO_NAME=$(echo "$RECIPIENTS_JSON" | jq -r ".[$i].name")

  echo "  Sending to: $TO_NAME <$TO_EMAIL>"

  # Build JSON payload (escape HTML for JSON)
  PAYLOAD=$(jq -n \
    --arg from "${FROM_NAME} <${FROM_EMAIL}>" \
    --arg to "$TO_EMAIL" \
    --arg subject "${SUBJECT_PREFIX}Rate Intel — $BRIEFING_DATE" \
    --arg html "$HTML" \
    '{from: $from, to: $to, subject: $subject, html: $html}')

  RESPONSE=$(curl -sf -w "\n%{http_code}" \
    "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>&1 || true)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    EMAIL_ID=$(echo "$BODY" | jq -r '.id // "unknown"')
    echo "  [OK] Sent (ID: $EMAIL_ID)"
  else
    echo "  [FAIL] HTTP $HTTP_CODE"
    echo "  Response: $BODY"
    SEND_FAILURES=$((SEND_FAILURES + 1))
  fi
done

echo ""
if [ "$SEND_FAILURES" -gt 0 ]; then
  echo "=== Rate briefing FAILED for $SEND_FAILURES of $RECIPIENT_COUNT recipients ==="
  exit 1
fi
echo "=== Rate briefing complete — $RECIPIENT_COUNT sent ==="
