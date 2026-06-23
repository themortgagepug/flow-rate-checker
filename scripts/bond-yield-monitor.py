#!/usr/bin/env python3
"""Upstream rate canary using BoC Valet API.

Tracks the actual drivers of broker-channel mortgage rates:
  - BoC overnight target rate (V39079) — variable rates move same-day
  - 5yr GoC bond yield (BD.CDN.5YR.DQ.YLD) — 5yr fixed follows with ~1-2wk lag
  - 2yr / 10yr GoC bond yields (curve context, not alert triggers)

Alerts:
  - DoD: BoC overnight rate change → IMMEDIATE email any day
  - WoW: 5yr bond moves >= 8bps vs ~7 days ago → Monday digest email
  - Otherwise silent.

Why these signals: Lender Spotlight (Alex's actual rate source) is automation-
banned per ToS. But fixed/variable mortgage rates are *driven* by these
upstream feeds. When the 5yr bond moves >= 8bps, broker fixed rates almost
always reprice within 1-2 weeks. This canary catches the signal BEFORE the
broker channel reprices, giving Alex lead time to check Lender Spotlight.

Usage:
  python3 scripts/bond-yield-monitor.py            # normal run
  python3 scripts/bond-yield-monitor.py --force-email   # email regardless of triggers
  python3 scripts/bond-yield-monitor.py --dry-run       # snapshot + diff, no append/email
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

VALET_BASE = "https://www.bankofcanada.ca/valet/observations"
SERIES = {
    "boc_overnight": "V39079",
    "bond_2yr": "BD.CDN.2YR.DQ.YLD",
    "bond_5yr": "BD.CDN.5YR.DQ.YLD",
    "bond_10yr": "BD.CDN.10YR.DQ.YLD",
}
WOW_BOND_THRESHOLD_BPS = 8
HUB_URL_DEFAULT = "https://transcript-processor-vxwqplu37q-uc.a.run.app/rates"


def fetch_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": "flow-bond-monitor/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def fetch_valet_observations():
    """Pull most recent observation for each series.

    Returns dict keyed by friendly name, value = (rate%, observation_date_iso).
    BoC publishes weekday-only for bond yields; uses the most recent obs.
    """
    series_codes = ",".join(SERIES.values())
    url = f"{VALET_BASE}/{series_codes}/json?recent=5"
    raw = fetch_url(url)
    data = json.loads(raw)
    obs = data.get("observations", [])
    if not obs:
        raise RuntimeError("BoC Valet returned no observations")

    out = {}
    # Walk back through observations until each series has a non-null value
    for name, code in SERIES.items():
        for o in reversed(obs):
            entry = o.get(code, {})
            v = entry.get("v")
            if v not in (None, ""):
                try:
                    out[name] = (float(v), o["d"])
                    break
                except (TypeError, ValueError):
                    continue
        if name not in out:
            raise RuntimeError(f"BoC Valet: no usable observation for {name} ({code})")
    return out


def load_history(path):
    if not path.exists():
        return []
    return json.loads(path.read_text()).get("history", [])


def save_history(path, history):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"history": history}, indent=2) + "\n")


def find_dod_entry(history, today_iso):
    """Most recent entry strictly before today."""
    prior = [h for h in history if h["date"] < today_iso]
    return prior[-1] if prior else None


def find_wow_entry(history, today):
    target_lo = today - timedelta(days=9)
    target_hi = today - timedelta(days=5)
    cands = [h for h in history if target_lo <= date.fromisoformat(h["date"]) <= target_hi]
    if not cands:
        return None
    mid = today - timedelta(days=7)
    cands.sort(key=lambda h: abs((date.fromisoformat(h["date"]) - mid).days))
    return cands[0]


def fetch_hub_context(hub_url):
    try:
        d = json.loads(fetch_url(hub_url))
        updated = d.get("updated_at", "")
        days_stale = None
        if updated:
            try:
                ts = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                days_stale = (datetime.now(timezone.utc) - ts).days
            except Exception:
                pass
        return {
            "boc_rate": d.get("boc_rate"),
            "prime_rate": d.get("prime_rate"),
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
        "from": os.environ.get("ALERT_EMAIL_FROM", "Flow Rate Bot <rates@getflowmortgage.ca>"),
        "to": [a.strip() for a in to_addr.split(",") if a.strip()],
        "subject": subject,
        "text": body,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare fronts api.resend.com and signature-bans the default
            # Python-urllib UA (HTTP 403, error code 1010). A normal UA clears
            # it — same reason the sibling curl-based workflows never tripped.
            "User-Agent": "curl/8.7.1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print(f"Email sent: {subject}")
        return True
    except urllib.error.HTTPError as e:
        # Surface Resend's JSON error body — a bare 403 hides the real cause
        # (unverified domain, restricted key, etc.). Loud but non-fatal: the
        # canary's core job is the committed snapshot, so a bounced
        # notification must not red-X the whole run.
        try:
            detail = e.read().decode("utf-8", "replace")
        except Exception:
            detail = "<no response body>"
        print(f"WARNING: Resend send failed: HTTP {e.code} {e.reason} — {detail}")
        return False
    except Exception as e:
        print(f"WARNING: Resend send failed: {e}")
        return False


def compose_email(today_entry, dod_change, wow_change, hub):
    """Build a single email covering whichever triggers fired.

    dod_change: dict | None — {old_boc, new_boc, change_bps} if BoC moved DoD
    wow_change: dict | None — {old_5yr, new_5yr, delta_bps} if 5yr bond moved WoW
    """
    headlines = []
    if dod_change:
        sign = "+" if dod_change["change_bps"] > 0 else ""
        headlines.append(f"BoC overnight {sign}{dod_change['change_bps']}bps (now {dod_change['new_boc']}%)")
    if wow_change:
        sign = "+" if wow_change["delta_bps"] > 0 else ""
        headlines.append(f"5yr bond {sign}{wow_change['delta_bps']}bps WoW")

    subject = "RATE SIGNAL — " + " | ".join(headlines) if headlines else "RATE SIGNAL — daily snapshot"

    parts = []

    if dod_change:
        new_prime = round(dod_change["new_boc"] + 2.20, 2)
        old_prime = round(dod_change["old_boc"] + 2.20, 2)
        prime_delta_bps = dod_change["change_bps"]  # 1:1 transmission convention
        parts.append(
            f"== BoC OVERNIGHT MOVED ==\n"
            f"  {dod_change['old_boc']}% -> {dod_change['new_boc']}%   ({prime_delta_bps:+}bps)\n"
            f"\n"
            f"  Prime rate convention (BoC + 220bps): {old_prime}% -> {new_prime}%\n"
            f"  Variable rates reprice TODAY at the new prime.\n"
            f"  Confirm Big-5 prime in the next 24h (usually lockstep, but verify).\n"
            f"\n"
            f"  Action: open Lender Spotlight, confirm broker variable spreads, then:\n"
            f"    /rate-update boc={dod_change['new_boc']} prime={new_prime} var=X.XX\n"
        )

    if wow_change:
        parts.append(
            f"== 5yr GoC BOND YIELD MOVED (WoW) ==\n"
            f"  {wow_change['old_5yr']}% -> {wow_change['new_5yr']}%   ({wow_change['delta_bps']:+}bps)\n"
            f"  Prior observation: {wow_change['old_date']}\n"
            f"\n"
            f"  5yr fixed mortgage rates typically follow 5yr GoC yields with a\n"
            f"  1-2 week lag. Lenders usually reprice when the bond breaks a\n"
            f"  meaningful level (5-10bps sustained move).\n"
            f"\n"
            f"  Action: check Lender Spotlight in 3-7 days for repricing. If\n"
            f"  broker sheet has moved, run:\n"
            f"    /rate-update 1yr=X.XX 2yr=X.XX 3yr=X.XX 4yr=X.XX 5yr=X.XX\n"
        )

    parts.append(
        f"== Today's full snapshot ==\n"
        f"  BoC overnight: {today_entry['boc_overnight']}% (obs {today_entry['dates']['boc_overnight']})\n"
        f"  2yr GoC bond: {today_entry['bond_2yr']}%   (obs {today_entry['dates']['bond_2yr']})\n"
        f"  5yr GoC bond: {today_entry['bond_5yr']}%   (obs {today_entry['dates']['bond_5yr']})\n"
        f"  10yr GoC bond: {today_entry['bond_10yr']}% (obs {today_entry['dates']['bond_10yr']})\n"
    )

    if "error" not in hub:
        parts.append(
            f"== Central hub state ==\n"
            f"  Last touched: {hub.get('days_stale')}d ago ({hub.get('updated_at','?')})\n"
            f"  BoC: {hub.get('boc_rate')}% | Prime: {hub.get('prime_rate')}%\n"
            f"  Advertised 5yr fixed: {hub.get('advertised_5yr')}%\n"
            f"  Advertised 5yr variable: {hub.get('advertised_vrm_effective')}%\n"
        )

    parts.append(
        "Lender Spotlight remains the source of truth — confirm there before running /rate-update.\n"
        "(Lender Spotlight automation is ToS-banned; this canary watches upstream BoC + bond signals\n"
        " instead, which lead the broker-channel reprice by 1-2 weeks.)"
    )

    body = "\n\n".join(parts)
    return subject, body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-email", action="store_true")
    ap.add_argument("--history", default=os.environ.get("HISTORY_PATH", "data/bond-yield-history.json"))
    ap.add_argument("--hub-url", default=os.environ.get("HUB_URL", HUB_URL_DEFAULT))
    args = ap.parse_args()

    history_path = Path(args.history)
    today = date.today()
    today_iso = today.isoformat()

    obs = fetch_valet_observations()
    today_entry = {
        "date": today_iso,
        "boc_overnight": obs["boc_overnight"][0],
        "bond_2yr": obs["bond_2yr"][0],
        "bond_5yr": obs["bond_5yr"][0],
        "bond_10yr": obs["bond_10yr"][0],
        "dates": {k: v[1] for k, v in obs.items()},
    }
    print(
        f"snapshot {today_iso}: "
        f"BoC={today_entry['boc_overnight']} "
        f"2yr={today_entry['bond_2yr']} "
        f"5yr={today_entry['bond_5yr']} "
        f"10yr={today_entry['bond_10yr']}"
    )

    history = load_history(history_path)
    if not args.dry_run:
        history = [h for h in history if h["date"] != today_iso] + [today_entry]
        history.sort(key=lambda h: h["date"])
        save_history(history_path, history)
        print(f"history: {len(history)} entries")

    dod = find_dod_entry(history, today_iso)
    wow = find_wow_entry(history, today)

    dod_change = None
    if dod and dod["boc_overnight"] != today_entry["boc_overnight"]:
        dod_change = {
            "old_boc": dod["boc_overnight"],
            "new_boc": today_entry["boc_overnight"],
            "change_bps": round((today_entry["boc_overnight"] - dod["boc_overnight"]) * 100),
            "old_date": dod["date"],
        }
        print(f"DoD: BoC overnight changed {dod_change['change_bps']:+}bps")

    wow_change = None
    if wow:
        delta = round((today_entry["bond_5yr"] - wow["bond_5yr"]) * 100)
        if abs(delta) >= WOW_BOND_THRESHOLD_BPS:
            wow_change = {
                "old_5yr": wow["bond_5yr"],
                "new_5yr": today_entry["bond_5yr"],
                "delta_bps": delta,
                "old_date": wow["date"],
            }
            print(f"WoW: 5yr bond delta {delta:+}bps vs {wow['date']}")
        else:
            print(f"WoW: 5yr bond delta {delta:+}bps (below {WOW_BOND_THRESHOLD_BPS}bps threshold)")
    else:
        print("WoW: no entry in the 5-9 day window yet")

    is_monday = today.weekday() == 0
    fire = False
    if dod_change:
        fire = True  # BoC moves are immediate, any weekday
    if wow_change and (is_monday or args.force_email):
        fire = True
    if args.force_email and not fire:
        # let test runs see the email even on quiet days
        fire = True

    if not fire:
        print("No trigger fired. Silent.")
        return 0

    hub = fetch_hub_context(args.hub_url)
    subject, body = compose_email(today_entry, dod_change, wow_change, hub)
    if not send_email(subject, body):
        print("Email did not send (see warning above). Snapshot still recorded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
