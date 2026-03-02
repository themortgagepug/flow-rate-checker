#!/usr/bin/env bash
# Flow Rate Intelligence — Weekly Briefing Email
# Fetches live rates from Supabase, builds HTML email, sends via Resend
# Requires: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY env vars

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUPABASE_URL="https://dotglplhsdsmrbacmtrx.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"
RESEND_KEY="${RESEND_API_KEY:?RESEND_API_KEY required}"
DATA_FILE="$SCRIPT_DIR/rate-intel-data.json"
TEMPLATE_FILE="$SCRIPT_DIR/rate-briefing-template.html"

BRIEFING_DATE=$(TZ="America/Toronto" date +"%B %-d, %Y")
BRIEFING_TIME=$(TZ="America/Toronto" date +"%-I:%M %p")

echo "=== Flow Rate Intelligence Briefing ==="
echo "Date: $BRIEFING_DATE $BRIEFING_TIME ET"

# ── 1. Fetch live rates from Supabase ──
echo ""
echo "Fetching rates from Supabase..."
RATES_JSON=$(curl -sf \
  "$SUPABASE_URL/rest/v1/market_rates?rate_type=eq.uninsured&select=term_key,rate,source,updated_at" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY")

# Parse individual rates
RATE_1YR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="1yr_fixed") | .rate')
RATE_2YR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="2yr_fixed") | .rate')
RATE_3YR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="3yr_fixed") | .rate')
RATE_4YR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="4yr_fixed") | .rate')
RATE_5YR_FIXED=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="5yr_fixed") | .rate')
RATE_5YR_VAR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="5yr_variable") | .rate')
RATE_10YR=$(echo "$RATES_JSON" | jq -r '.[] | select(.term_key=="10yr_fixed") | .rate // "4.99"')
RATE_SOURCE=$(echo "$RATES_JSON" | jq -r '.[0].source // "WOWA.ca Best Uninsured Rates"')
RATE_UPDATED=$(echo "$RATES_JSON" | jq -r '[.[].updated_at] | max | split("T")[0] // "today"')

echo "  1yr: $RATE_1YR | 2yr: $RATE_2YR | 3yr: $RATE_3YR"
echo "  4yr: $RATE_4YR | 5yr fixed: $RATE_5YR_FIXED | 5yr var: $RATE_5YR_VAR"
echo "  10yr: $RATE_10YR | Source: $RATE_SOURCE"

# ── 2. Calculate program rates ──
# Insured = uninsured - 0.10, Insurable = uninsured - 0.05
INSURED_ADJ=$(jq -r '.programs.insured.rate_adjustment' "$DATA_FILE")
INSURABLE_ADJ=$(jq -r '.programs.insurable.rate_adjustment' "$DATA_FILE")
RATE_INSURED=$(echo "$RATE_5YR_FIXED + $INSURED_ADJ" | bc)
RATE_INSURABLE=$(echo "$RATE_5YR_FIXED + $INSURABLE_ADJ" | bc)

echo "  Insured 5yr: $RATE_INSURED | Insurable 5yr: $RATE_INSURABLE"

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

# ── 6. Send via Resend ──
echo ""
echo "Sending email via Resend..."
FROM_EMAIL=$(jq -r '.from_email' "$DATA_FILE")
FROM_NAME=$(jq -r '.from_name' "$DATA_FILE")
RECIPIENT_COUNT=$(jq '.team_recipients | length' "$DATA_FILE")

for i in $(seq 0 $((RECIPIENT_COUNT - 1))); do
  TO_EMAIL=$(jq -r ".team_recipients[$i].email" "$DATA_FILE")
  TO_NAME=$(jq -r ".team_recipients[$i].name" "$DATA_FILE")

  echo "  Sending to: $TO_NAME <$TO_EMAIL>"

  # Build JSON payload (escape HTML for JSON)
  PAYLOAD=$(jq -n \
    --arg from "${FROM_NAME} <${FROM_EMAIL}>" \
    --arg to "$TO_EMAIL" \
    --arg subject "Rate Intel — $BRIEFING_DATE" \
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
  fi
done

echo ""
echo "=== Rate briefing complete ==="
