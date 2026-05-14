#!/usr/bin/env python3
"""nesto rate market canary.

Pulls nesto.ca's headline 5yr fixed + 5yr variable rates from the "Today's
Best Mortgage Rates" block, appends to a local history file, and on Mondays
emails Alex if either rate moved >= 5 bps week-over-week.

nesto's headlines are INSURED best-rates, not directly comparable to Flow's
advertised UNINSURED rates. Treat as a directional market-movement signal,
not as a proposed value for /rate-update.

Usage:
  python3 scripts/nesto-monitor.py            # normal: scrape, append, alert if Monday
  python3 scripts/nesto-monitor.py --force-email   # email regardless of weekday (for testing)
  python3 scripts/nesto-monitor.py --dry-run       # parse + diff, no append, no email

Env vars:
  RESEND_API_KEY    - required for email
  ALERT_EMAIL_TO    - default alex@getflowmortgage.ca
  HISTORY_PATH      - default data/nesto-rate-history.json
  HUB_URL           - default Flow central rate hub /rates endpoint
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

NESTO_URL = "https://www.nesto.ca/mortgage-rates-canada/"
HUB_URL_DEFAULT = "https://transcript-processor-vxwqplu37q-uc.a.run.app/rates"
WOW_THRESHOLD_BPS = 5
SANITY_FIXED = (2.0, 9.0)
SANITY_VAR = (1.5, 9.0)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15"


def fetch_url(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def parse_nesto(html):
    """Extract 5yr fixed + 5yr variable from nesto's best-rates block.

    The block contains a structured snippet of the form:
      Fixed rate | 4.04 | % | 5-year fixed*
      Variable rate | 3.40 | % | 5-year variable* (Prime - 1.05% )
    We anchor on the rate-label sequence and grab the first plausible value.
    Raises if the structure has changed enough that we can't extract cleanly.
    """
    block_match = re.search(
        r'<h3 class="best-rates-title"[^>]*>Today.s Best Mortgage Rates.*?</section>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if not block_match:
        raise RuntimeError("nesto page structure changed: no 'best-rates-title' block")

    text = re.sub(r"<[^>]+>", " | ", block_match.group(0))
    text = re.sub(r"\s+", " ", text)

    fixed = _extract_rate(text, "Fixed rate", "5-year fixed", SANITY_FIXED)
    variable = _extract_rate(text, "Variable rate", "5-year variable", SANITY_VAR)
    return {"5yr_fixed_insured": fixed, "5yr_variable_insured": variable}


def _extract_rate(text, label_start, label_end, sanity):
    """Pull a numeric rate between a label_start and label_end marker."""
    # Tag-stripped text looks like "Fixed rate | | | 4.04 | | % | | | 5-year fixed*"
    # Tolerate any run of pipes/whitespace between segments.
    sep = r"[\s|]*"
    pat = re.compile(
        re.escape(label_start) + sep + r"(\d+\.\d{2})" + sep + r"%" + sep + re.escape(label_end),
        re.IGNORECASE | re.DOTALL,
    )
    m = pat.search(text)
    if not m:
        raise RuntimeError(f"nesto: could not locate rate for '{label_start}' -> '{label_end}'")
    val = float(m.group(1))
    if not (sanity[0] <= val <= sanity[1]):
        raise RuntimeError(f"nesto: '{label_start}' rate {val}% out of sanity range {sanity}")
    return val


def load_history(path):
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data.get("history", [])


def save_history(path, history):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"history": history}, indent=2) + "\n")


def find_wow_entry(history, today):
    """Closest history entry within [5, 9] days ago — covers a typical WoW window."""
    target_lo = today - timedelta(days=9)
    target_hi = today - timedelta(days=5)
    candidates = [
        h for h in history
        if target_lo <= date.fromisoformat(h["date"]) <= target_hi
    ]
    if not candidates:
        return None
    # Pick the one closest to 7 days ago
    target_mid = today - timedelta(days=7)
    candidates.sort(key=lambda h: abs((date.fromisoformat(h["date"]) - target_mid).days))
    return candidates[0]


def fetch_hub_context(hub_url):
    """Return the bits of the central rate hub we mention in the email."""
    try:
        raw = fetch_url(hub_url)
        d = json.loads(raw)
        updated = d.get("updated_at", "")
        days_stale = None
        if updated:
            try:
                ts = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                days_stale = (datetime.now(timezone.utc) - ts).days
            except Exception:
                pass
        return {
            "advertised_5yr": d.get("advertised_5yr"),
            "advertised_vrm_effective": d.get("advertised_vrm_effective"),
            "updated_at": updated,
            "days_stale": days_stale,
        }
    except Exception as e:
        return {"error": str(e)}


def send_email(subject, body):
    api_key = os.environ.get("RESEND_API_KEY", "")
    to_addr = os.environ.get("ALERT_EMAIL_TO", "alex@getflowmortgage.ca")
    if not api_key:
        print("RESEND_API_KEY not set — would have sent:")
        print(f"Subject: {subject}")
        print(body)
        return
    payload = json.dumps({
        "from": "Flow Rate Bot <rates@getflowmortgage.ca>",
        "to": to_addr,
        "subject": subject,
        "text": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        if r.status >= 300:
            raise RuntimeError(f"Resend returned {r.status}")
    print(f"Email sent: {subject}")


def compose_email(today_rates, prior, deltas_bps, hub):
    fixed_delta = deltas_bps.get("5yr_fixed_insured", 0)
    var_delta = deltas_bps.get("5yr_variable_insured", 0)
    main_movers = []
    if abs(fixed_delta) >= WOW_THRESHOLD_BPS:
        sign = "+" if fixed_delta > 0 else ""
        main_movers.append(f"5yr fixed {sign}{fixed_delta}bps")
    if abs(var_delta) >= WOW_THRESHOLD_BPS:
        sign = "+" if var_delta > 0 else ""
        main_movers.append(f"5yr var {sign}{var_delta}bps")

    subject = "MARKET MOVE — nesto " + ", ".join(main_movers) if main_movers else "MARKET MOVE — nesto WoW"

    hub_line = "Central hub: unable to read (see log)"
    if "error" not in hub:
        adv5 = hub.get("advertised_5yr")
        advvr = hub.get("advertised_vrm_effective")
        days = hub.get("days_stale")
        stale_phrase = f"{days}d ago" if days is not None else "unknown"
        hub_line = (
            f"Central hub last touched {stale_phrase}. Current advertised:\n"
            f"  5yr fixed:    {adv5}%\n"
            f"  5yr variable: {advvr}%"
        )

    def fmt_delta(bps):
        if bps == 0:
            return "no change"
        sign = "+" if bps > 0 else ""
        return f"{sign}{bps}bps"

    body = f"""nesto.ca headline rates moved week-over-week:

  5yr fixed (insured):    {prior['5yr_fixed_insured']}% -> {today_rates['5yr_fixed_insured']}%   ({fmt_delta(fixed_delta)})
  5yr variable (insured): {prior['5yr_variable_insured']}% -> {today_rates['5yr_variable_insured']}%   ({fmt_delta(var_delta)})

  Prior reading: {prior['date']}
  Today:         {today_rates['date']}

{hub_line}

Suggested action: open Lender Spotlight, check whether your broker sheet
shifted in the same direction. If yes, run /rate-update with the new values:

  /rate-update 1yr=X.XX 2yr=X.XX 3yr=X.XX 4yr=X.XX 5yr=X.XX var=X.XX

Note: nesto headlines are INSURED best rates, not directly comparable to
your advertised UNINSURED. Use as a directional signal, not as a proposal.
"""
    return subject, body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-email", action="store_true")
    ap.add_argument("--history", default=os.environ.get("HISTORY_PATH", "data/nesto-rate-history.json"))
    ap.add_argument("--hub-url", default=os.environ.get("HUB_URL", HUB_URL_DEFAULT))
    args = ap.parse_args()

    history_path = Path(args.history)
    today = date.today()
    today_iso = today.isoformat()

    # 1. Scrape
    html = fetch_url(NESTO_URL)
    rates = parse_nesto(html)
    today_entry = {"date": today_iso, **rates}
    print(f"nesto today: {today_iso}: {rates}")

    # 2. History (skip append on dry-run, also dedupe same-day)
    history = load_history(history_path)
    if not args.dry_run:
        history = [h for h in history if h["date"] != today_iso] + [today_entry]
        history.sort(key=lambda h: h["date"])
        save_history(history_path, history)
        print(f"history: {len(history)} entries, latest={history[-1]['date']}")

    # 3. WoW diff
    prior = find_wow_entry(history, today)
    if not prior:
        print("No prior entry in the 5-9 day window. Skipping alert.")
        return 0

    deltas_bps = {
        k: round((today_entry[k] - prior[k]) * 100)
        for k in ("5yr_fixed_insured", "5yr_variable_insured")
    }
    print(f"deltas vs {prior['date']}: {deltas_bps}")

    any_mover = any(abs(v) >= WOW_THRESHOLD_BPS for v in deltas_bps.values())
    is_monday = today.weekday() == 0

    if not any_mover:
        print("No WoW movement >= threshold. Silent.")
        return 0

    if not (is_monday or args.force_email):
        print("Movement detected but not Monday — deferring alert to Monday digest.")
        return 0

    hub = fetch_hub_context(args.hub_url)
    subject, body = compose_email(today_entry, prior, deltas_bps, hub)
    send_email(subject, body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
