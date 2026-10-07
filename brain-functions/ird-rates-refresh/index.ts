// ird-rates-refresh: daily refresh of the IRD penalty comparison rates.
//
// The penalty engine compares a borrower's rate against the lender's POSTED
// rate for the remaining term (Big 6) or a Government of Canada yield (EQB
// Standard). Those used to be a hand-typed table in irdEngine.ts stamped
// 2026-07-06. By October RBC, Scotia and National Bank had all moved, and the
// TD and BMO 2yr cells had been wrong from the start, so every estimate on
// rate.getflowmortgage.ca ran on numbers nobody had checked in a quarter.
//
// This reads each bank's own feed, the same data its public rate page renders,
// plus BoC Valet, and writes public.ird_reference_rates. A source that fails or
// returns anything implausible keeps its last good row and is reported. It is
// never overwritten with a guess. Freshness is watched by ird_rates_heartbeat().
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";

type Row = { source: string; term: string; rate: number; source_url: string; effective_date?: string | null };

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, accept: "*/*", ...(init.headers || {}) },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

const pct = (v: unknown) => {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`unparseable rate ${v}`);
  return Math.round(n * 1000) / 100000; // "6.090" -> 0.0609
};

function bankRows(source: string, url: string, byTerm: Record<string, unknown>, effective?: string | null): Row[] {
  return ["1", "2", "3", "4", "5"].map((t) => {
    if (byTerm[t] == null) throw new Error(`${source} feed has no ${t}yr posted rate`);
    return { source, term: t, rate: pct(byTerm[t]), source_url: url, effective_date: effective ?? null };
  });
}

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/\s+/g, " ");

const FETCHERS: Record<string, () => Promise<Row[]>> = {
  async TD() {
    const url = "https://psservice.td.com/ca/en/carate/getRates";
    const d = await (await get(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.td.com" },
      body: JSON.stringify({ errorText: "Unable to get the rate", ratesType: "resl" }),
    })).json();
    // Each code maps to [posted, discount, special, apr, flag].
    const code = { "1": "MTGF012C", "2": "MTGF024C", "3": "MTGF036C", "4": "MTGF048C", "5": "MTGF060C" } as const;
    const by: Record<string, unknown> = {};
    for (const [t, c] of Object.entries(code)) by[t] = d?.[c]?.nonHighRatio?.[0];
    return bankRows("TD", url, by);
  },

  async SCOTIA() {
    const url = "https://dmtsms.scotiabank.com/api/rates/daily/nonspecialmortgage";
    const d = await (await get(url)).json();
    const product = (d?.data || []).find((p: any) => p.PRODUCT === "CONVENTIONAL RESIDENTIAL, ETC");
    if (!product) throw new Error("Scotia feed has no CONVENTIONAL RESIDENTIAL product");
    const by: Record<string, unknown> = {};
    for (const t of product.TERMS || []) if (t.TERM_UNIT === "Y") by[String(t.TERM_VALUE)] = t.RATE;
    return bankRows("SCOTIA", url, by, d?.update_time ?? null);
  },

  async BMO() {
    const url = "https://www.bmo.com/public-data/api/epm/v1.0/bmo-epm-mortgage.json";
    // BMO's CDN resets HTTP/2 streams from the edge runtime; HTTP/1.1 gets through.
    const client = (Deno as any).createHttpClient?.({ http2: false, http1: true });
    const d = await (await get(url, client ? ({ client } as RequestInit) : {})).json(); // usually times out
    const f = d?.mortgageRates?.fixed || {};
    const by: Record<string, unknown> = {};
    for (const t of ["1", "2", "3", "4", "5"]) by[t] = f[`${t}YearClosed`]?.value;
    return bankRows("BMO", url, by);
  },

  async CIBC() {
    const url =
      "https://www.cibconline.cibc.com/ebm-pno/api/v1/json/productRatesLegacy?lobId=5&sourceProductCode=FRCM%2c";
    const body = await (await get(url, { headers: { referer: "https://www.cibc.com/" } })).text();
    // Rate type 1 is the posted rate; 18 is the special offer.
    const by: Record<string, unknown> = {};
    for (const m of body.matchAll(/\['(\d+)_null_null_Years?_T',\s*null,\s*1,\s*'([\d.]+)'/g)) by[m[1]] = m[2];
    return bankRows("CIBC", "https://www.cibc.com/en/interest-rates/mortgage-rates.html", by);
  },

  async RBC() {
    const url = "https://www.rbcroyalbank.com/mortgages/mortgage-rates.html";
    const text = strip(await (await get(url)).text());
    const start = text.search(/Posted Rates\s*–\s*Fixed Rate Mortgages/i);
    if (start < 0) throw new Error("RBC page has no posted fixed-rate table");
    const section = text.slice(start, start + 1500);
    const by: Record<string, unknown> = {};
    for (const m of section.matchAll(/(\d) Year Closed (\d+\.\d+) ?%/g)) by[m[1]] ??= m[2];
    return bankRows("RBC", url, by);
  },

  async NBC() {
    const url = "https://www.nbc.ca/personal/mortgages/rates.html";
    const html = (await (await get(url)).text()).replace(/\\+x22/g, '"').replace(/\\u002D/g, "-");
    // The page embeds its rate data as JSON per product; PH-PRETHYP is the mortgage.
    const at = html.indexOf('"productId":"PH-PRETHYP"');
    if (at < 0) throw new Error("NBC page has no PH-PRETHYP rate block");
    const next = html.indexOf('"productId":', at + 12);
    const block = html.slice(at, next > at ? next : at + 6000);
    const by: Record<string, unknown> = {};
    for (const m of block.matchAll(/"taux(\d)ans?F":"([\d.]+)"/g)) by[m[1]] ??= m[2];
    return bankRows("NBC", url, by);
  },

  async GOC() {
    const series = {
      tbill_1y: "TB.CDN.1Y.MID",
      bond_2y: "BD.CDN.2YR.DQ.YLD",
      bond_3y: "BD.CDN.3YR.DQ.YLD",
      bond_5y: "BD.CDN.5YR.DQ.YLD",
    } as const;
    const url = `https://www.bankofcanada.ca/valet/observations/${Object.values(series).join(",")}/json?recent=1`;
    const d = await (await get(url)).json();
    const o = d?.observations?.[d.observations.length - 1];
    if (!o) throw new Error("BoC Valet returned no observations");
    return Object.entries(series).map(([term, id]) => ({
      source: "GOC", term, rate: pct(o[id]?.v), source_url: url, effective_date: o.d,
    }));
  },
};

// BoC's "typical" posted rate is the Big 6 mode. A bank figure far from it is a
// parse error, not a pricing decision, so it is refused.
async function bocTypical(): Promise<Record<string, number>> {
  const ids = { "1": "V80691333", "3": "V80691334", "5": "V80691335" };
  const d = await (await get(
    `https://www.bankofcanada.ca/valet/observations/${Object.values(ids).join(",")}/json?recent=1`,
  )).json();
  const o = d.observations[d.observations.length - 1];
  return Object.fromEntries(Object.entries(ids).map(([t, id]) => [t, pct(o[id].v)]));
}

function check(rows: Row[], typical: Record<string, number> | null) {
  for (const r of rows) {
    const [lo, hi] = r.source === "GOC" ? [0.002, 0.12] : [0.02, 0.15];
    if (!(r.rate > lo && r.rate < hi)) throw new Error(`${r.source} ${r.term} implausible: ${r.rate}`);
    const ref = typical?.[r.term];
    if (r.source !== "GOC" && ref && Math.abs(r.rate - ref) > 0.015) {
      throw new Error(`${r.source} ${r.term}yr ${r.rate} is >1.5pts from BoC typical ${ref}`);
    }
  }
}

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const typical = await bocTypical().catch(() => null);

  const results = await Promise.all(
    Object.entries(FETCHERS).map(async ([source, fn]) => {
      try {
        const rows = await fn();
        check(rows, typical);
        return { source, rows };
      } catch (e) {
        return { source, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const good = results.flatMap((r) => r.rows ?? []);
  // Stored too, so ird_rates_heartbeat() can compare BMO against it: BMO's CDN
  // refuses every non-browser client, so its row is hand-verified and this is
  // the tripwire that says when it needs re-checking.
  if (typical) {
    for (const [term, rate] of Object.entries(typical)) {
      good.push({ source: "BOC_TYPICAL", term, rate, source_url: "https://www.bankofcanada.ca/valet/observations/V80691333,V80691334,V80691335/json" });
    }
  }
  const { data: prior, error: readErr } = await db.from("ird_reference_rates").select("source, term, rate, changed_at");
  if (readErr) return Response.json({ error: `read failed: ${readErr.message}` }, { status: 500 });
  const before = new Map((prior || []).map((p) => [`${p.source}|${p.term}`, Number(p.rate)]));
  const lastChanged = new Map((prior || []).map((p) => [`${p.source}|${p.term}`, p.changed_at as string]));

  const now = new Date().toISOString();
  const changed = good.filter((r) => before.get(`${r.source}|${r.term}`) !== r.rate);
  // A bulk upsert writes NULL for any column a row omits, so every row carries
  // changed_at: now if the rate moved, otherwise the value it already had.
  const upserts = good.map((r) => ({
    effective_date: null,
    ...r,
    fetched_at: now,
    changed_at: changed.includes(r) ? now : lastChanged.get(`${r.source}|${r.term}`) ?? now,
  }));

  if (upserts.length) {
    const { error } = await db.from("ird_reference_rates").upsert(upserts, { onConflict: "source,term" });
    if (error) return Response.json({ error: `upsert failed: ${error.message}` }, { status: 500 });
  }
  if (changed.length) {
    await db.from("ird_reference_rates_history").insert(
      changed.map((r) => ({
        source: r.source, term: r.term, old_rate: before.get(`${r.source}|${r.term}`) ?? null, new_rate: r.rate,
      })),
    );
  }

  const failed = Object.fromEntries(results.filter((r) => r.error).map((r) => [r.source, r.error]));
  // BMO failing is expected (see above), so it does not fail the run on its own.
  const hardFailures = Object.keys(failed).filter((s) => s !== "BMO");
  if (!typical) hardFailures.push("BOC_TYPICAL");
  return Response.json(
    {
      ok: hardFailures.length === 0,
      updated_sources: results.filter((r) => r.rows).map((r) => r.source),
      changed: changed.map((r) => `${r.source} ${r.term}: ${before.get(`${r.source}|${r.term}`) ?? "new"} -> ${r.rate}`),
      failed,
      boc_typical: typical,
    },
    { status: hardFailures.length ? 207 : 200 },
  );
});
