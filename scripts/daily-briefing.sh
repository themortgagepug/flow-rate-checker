#!/usr/bin/env bash
# Flow Daily Briefing - queries Supabase projects table + system health
# Sends email via Resend with blocked/stale/urgent items
set -euo pipefail

SUPABASE_URL="https://jkeujqzlclrxhwamplby.supabase.co"
ANON_KEY="${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY required}"
RESEND_KEY="${RESEND_API_KEY:?RESEND_API_KEY required}"
DATE=$(TZ='America/Vancouver' date '+%B %d, %Y')
TODAY=$(date -u +%Y-%m-%d)
STALE_CUTOFF=$(date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d)

echo "=== Flow Daily Briefing - $DATE ==="

# --- Query projects ---
BLOCKED=$(curl -sf "$SUPABASE_URL/rest/v1/projects?status=eq.blocked&select=name,blockers,owner,next_action" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" || echo "[]")

URGENT=$(curl -sf "$SUPABASE_URL/rest/v1/projects?priority=lte.2&status=neq.live&status=neq.done&select=name,status,next_action,priority,owner&order=priority" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" || echo "[]")

STALE=$(curl -sf "$SUPABASE_URL/rest/v1/projects?last_touched=lt.$STALE_CUTOFF&status=in.(draft,not_started)&priority=lte.3&select=name,last_touched,next_action,owner&order=last_touched" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" || echo "[]")

BLOCKED_COUNT=$(echo "$BLOCKED" | jq 'length')
URGENT_COUNT=$(echo "$URGENT" | jq 'length')
STALE_COUNT=$(echo "$STALE" | jq 'length')

echo "Blocked: $BLOCKED_COUNT | Urgent: $URGENT_COUNT | Stale: $STALE_COUNT"

# --- System health checks (inline) ---
HEALTH_FAILS=""
HEALTH_OK=0
HEALTH_FAIL=0

check_system() {
  local name="$1" url="$2" mode="$3"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 ${mode:+-L} "$url" 2>/dev/null || echo "000")
  if [ "$mode" = "auth" ]; then
    if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then
      HEALTH_OK=$((HEALTH_OK + 1))
    else
      HEALTH_FAIL=$((HEALTH_FAIL + 1))
      HEALTH_FAILS="${HEALTH_FAILS}<li style='color:#f87171'>$name (HTTP $STATUS)</li>"
    fi
  elif [ "$mode" = "json" ]; then
    BODY=$(curl -sf --max-time 10 "$url" 2>/dev/null || echo "")
    if [ "$STATUS" = "200" ] && echo "$BODY" | grep -q '"status".*"ok"'; then
      HEALTH_OK=$((HEALTH_OK + 1))
    else
      HEALTH_FAIL=$((HEALTH_FAIL + 1))
      HEALTH_FAILS="${HEALTH_FAILS}<li style='color:#f87171'>$name (HTTP $STATUS)</li>"
    fi
  else
    if [ "$STATUS" = "200" ]; then
      HEALTH_OK=$((HEALTH_OK + 1))
    else
      HEALTH_FAIL=$((HEALTH_FAIL + 1))
      HEALTH_FAILS="${HEALTH_FAILS}<li style='color:#f87171'>$name (HTTP $STATUS)</li>"
    fi
  fi
}

check_system "PDF Generator" "https://flow-pdf-generator-158142130858.us-central1.run.app/health" "json"
check_system "Transcript Processor" "https://transcript-processor-158142130858.us-central1.run.app/" "auth"
check_system "Partner Intel" "https://partner-intel-158142130858.us-central1.run.app/" "auth"
check_system "Finmo Sync" "https://finmo-sync-158142130858.us-central1.run.app/" "auth"
check_system "Rate Quiz" "https://rate.getflowmortgage.ca" "web"
check_system "Flow Website" "https://getflowmortgage.ca" "web"

HEALTH_TOTAL=$((HEALTH_OK + HEALTH_FAIL))
echo "Systems: $HEALTH_OK/$HEALTH_TOTAL healthy"

# --- Build HTML email ---
SUBJECT="Flow Brief - $DATE"
[ "$BLOCKED_COUNT" -gt 0 ] && SUBJECT="$SUBJECT | $BLOCKED_COUNT blocked"
[ "$URGENT_COUNT" -gt 0 ] && SUBJECT="$SUBJECT | $URGENT_COUNT urgent"
[ "$HEALTH_FAIL" -gt 0 ] && SUBJECT="$SUBJECT | $HEALTH_FAIL systems down"
[ "$BLOCKED_COUNT" -eq 0 ] && [ "$URGENT_COUNT" -eq 0 ] && [ "$HEALTH_FAIL" -eq 0 ] && SUBJECT="$SUBJECT | All clear"

# Build sections
BLOCKED_HTML=""
if [ "$BLOCKED_COUNT" -gt 0 ]; then
  BLOCKED_HTML="<h3 style='color:#f87171;margin:16px 0 8px'>Blocked ($BLOCKED_COUNT)</h3><ul>"
  BLOCKED_HTML="${BLOCKED_HTML}$(echo "$BLOCKED" | jq -r '.[] | "<li><b>" + .name + "</b> (" + (.owner // "alex") + ")<br><span style=\"color:#94a3b8\">" + (.blockers // "no details") + "</span></li>"')"
  BLOCKED_HTML="${BLOCKED_HTML}</ul>"
fi

URGENT_HTML=""
if [ "$URGENT_COUNT" -gt 0 ]; then
  URGENT_HTML="<h3 style='color:#fb923c;margin:16px 0 8px'>Urgent / High Priority ($URGENT_COUNT)</h3><ul>"
  URGENT_HTML="${URGENT_HTML}$(echo "$URGENT" | jq -r '.[] | "<li><b>" + .name + "</b> [" + .status + "] (" + (.owner // "alex") + ")<br><span style=\"color:#94a3b8\">" + (.next_action // "-") + "</span></li>"')"
  URGENT_HTML="${URGENT_HTML}</ul>"
fi

STALE_HTML=""
if [ "$STALE_COUNT" -gt 0 ]; then
  STALE_HTML="<h3 style='color:#facc15;margin:16px 0 8px'>Stale - Not Touched in 7+ Days ($STALE_COUNT)</h3><ul>"
  STALE_HTML="${STALE_HTML}$(echo "$STALE" | jq -r '.[] | "<li><b>" + .name + "</b> (last: " + (.last_touched // "unknown") + ", " + (.owner // "alex") + ")<br><span style=\"color:#94a3b8\">" + (.next_action // "-") + "</span></li>"')"
  STALE_HTML="${STALE_HTML}</ul>"
fi

SYSTEMS_HTML="<h3 style='color:#22c55e;margin:16px 0 8px'>Systems: $HEALTH_OK/$HEALTH_TOTAL operational</h3>"
if [ "$HEALTH_FAIL" -gt 0 ]; then
  SYSTEMS_HTML="<h3 style='color:#f87171;margin:16px 0 8px'>Systems: $HEALTH_FAIL/$HEALTH_TOTAL FAILING</h3><ul>$HEALTH_FAILS</ul>"
fi

BODY_HTML="<div style='font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;background:#0a1628;color:#e2e8f0;padding:32px;border-radius:12px'>"
BODY_HTML="${BODY_HTML}<h1 style='color:#06b6d4;margin:0 0 4px;font-size:20px'>Flow Daily Briefing</h1>"
BODY_HTML="${BODY_HTML}<p style='color:#64748b;margin:0 0 20px;font-size:13px'>$DATE</p>"
BODY_HTML="${BODY_HTML}${BLOCKED_HTML}${URGENT_HTML}${STALE_HTML}${SYSTEMS_HTML}"
BODY_HTML="${BODY_HTML}<p style='color:#475569;margin:24px 0 0;font-size:11px'>Automated daily briefing from Supabase projects table</p></div>"

# --- Send via Resend ---
PAYLOAD=$(jq -n \
  --arg from "Flow Systems <systems@getflowmortgage.ca>" \
  --arg to "alex@getflowmortgage.ca" \
  --arg subject "$SUBJECT" \
  --arg html "$BODY_HTML" \
  '{from: $from, to: [$to], subject: $subject, html: $html}')

SEND_RESULT=$(curl -sf -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" || echo '{"error":"send failed"}')

echo "Email sent: $SEND_RESULT"
echo "=== Briefing complete ==="
