"""bmo-posted-rates: relay for BMO's public mortgage rate feed.

BMO's CDN drops any client whose TLS handshake does not look like a browser,
so the Supabase edge runtime (and plain curl) time out on it. curl_cffi
impersonates Chrome's handshake and gets through. This returns BMO's posted
closed fixed rates for 1-5yr; ird-rates-refresh on the brain does the
validation and the database write, the same as for every other bank.
Read-only, public data only.
"""
import functions_framework
from curl_cffi import requests

FEED = "https://www.bmo.com/public-data/api/epm/v1.0/bmo-epm-mortgage.json"


@functions_framework.http
def bmo_posted_rates(request):
    try:
        r = requests.get(FEED, impersonate="chrome", timeout=25)
        r.raise_for_status()
        fixed = r.json()["mortgageRates"]["fixed"]
        rates = {t: fixed[f"{t}YearClosed"]["value"] for t in "12345"}
    except Exception as e:  # report, never invent
        return ({"error": f"{type(e).__name__}: {e}"}, 502)
    return {"source_url": FEED, "posted": rates}
