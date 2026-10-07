// mortgage-penalty-estimator — penalty/IRD estimates on the verified engine.
//
// Replaces the function of the same name on Supabase project
// dotglplhsdsmrbacmtrx, a legacy Lovable project outside Alex's org that could
// not be read, edited or audited. That version used its own simplified math and
// a rate table frozen at 2026-04-13, so the number it gave a client disagreed
// with the public calculator on getflowmortgage.ca.
//
// ./irdEngine.ts is a VERBATIM copy of src/lib/irdEngine.ts in flow-mortgage-hub,
// the engine unit-verified to the cent against each lender's published worked
// example. Do not edit the copy in place. Re-copy it from the hub so the public
// calculator and this endpoint can never drift.
//
// Comparison rates (Big 6 posted, GoC yields) load from public.ird_reference_rates,
// refreshed daily by ird-rates-refresh. If that read fails the engine's
// hand-verified fallback is used and the response says so in rates_source.
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  applyReferenceRates,
  calculatePenalty,
  deriveComparisonRate,
  POSTED_TABLE,
  RATES_AS_OF,
  LENDERS,
  type PenaltyInput,
} from "./irdEngine.ts";

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZXVqcXpsY2xyeGh3YW1wbGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDcyNzUsImV4cCI6MjA4MjE4MzI3NX0.Y2Bs9ur37qQ3dVdcy2XrVa-J5idbrENEPzCeeAn9ji4";
const BASE_KEYS = new Set([ANON_KEY, SERVICE_KEY, LEGACY_ANON].filter(Boolean));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Live comparison rates, re-read at most hourly per isolate.
const RATES_TTL_MS = 60 * 60 * 1000;
let ratesLoadedAt = 0;
let ratesSource: "live" | "fallback" = "fallback";

async function ensureRates() {
  if (Date.now() - ratesLoadedAt < RATES_TTL_MS) return;
  ratesLoadedAt = Date.now();
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);
    const { data, error } = await db.from("ird_reference_rates").select("source, term, rate, fetched_at");
    if (error) throw error;
    if (!data?.length) throw new Error("ird_reference_rates is empty");
    ratesSource = applyReferenceRates(data) ? "live" : "fallback";
  } catch (e) {
    console.error("IRD reference rates unavailable, using engine fallback:", e);
    ratesSource = "fallback";
  }
}

// The quiz sends short lender codes; the engine keys on its own names.
const CODE_TO_ENGINE: Record<string, string> = {
  TD: "TD",
  RBC: "RBC",
  BNS: "SCOTIA",
  SCOTIABANK: "SCOTIA",
  BMO: "BMO",
  CIBC: "CIBC",
  NBC: "NBC",
  FN: "FIRST_NATIONAL",
  MCAP: "MCAP",
  CMLS: "CMLS",
  MANULIFE: "MANULIFE",
  MERIX: "MERIX",
  TANGERINE: "TANGERINE",
  STRIVE: "STRIVE",
  EQB: "EQB_EVOLUTION",
};

// Lenders the quiz offers that the verified engine has no researched method for.
// They fall through to the engine's generic path, which is honest about it.
const UNMODELLED = new Set(["RMG", "B2B", "DESJ", "HSBC", "MERIDIAN", "OTHER"]);

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms <= 0 ? 0 : ms / (1000 * 60 * 60 * 24 * 30.4375);
}

// Posted-camp lenders compute IRD off the discount the borrower originally got.
// The quiz never asks for it, so infer it from the posted rate for the original
// term at funding. This is an estimate and is reported as one.
function derivedDiscount(engineName: string, contractRate: number, termYears: number) {
  const row = POSTED_TABLE[engineName];
  if (!row) return { discount: 0, postedAtFunding: 0, inferred: false };
  const yr = Math.min(5, Math.max(1, Math.round(termYears || 5)));
  const posted = row[yr];
  if (posted == null) return { discount: 0, postedAtFunding: 0, inferred: false };
  return { discount: Math.max(0, posted - contractRate), postedAtFunding: posted, inferred: true };
}

function mapConfidence(c: string): "high" | "medium" | "low" {
  if (c === "high" || c === "med-high") return "high";
  if (c === "moderate" || c === "low-mechanics") return "medium";
  return "low";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const apik = req.headers.get("apikey") || "";
    if (!BASE_KEYS.has(apik)) return json({ error: "unauthorized" }, 401);
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let p: any;
    try { p = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

    const balance = Number(p.balance);
    const contractPct = Number(p.contract_rate);
    if (!Number.isFinite(balance) || balance <= 0) return json({ error: "invalid_balance" }, 400);
    if (!Number.isFinite(contractPct) || contractPct <= 0 || contractPct > 25) {
      return json({ error: "invalid_contract_rate" }, 400);
    }

    await ensureRates();

    const rawLender = String(p.lender || "").trim().toUpperCase().replace(/[\s.-]+/g, "_");
    const engineName = CODE_TO_ENGINE[rawLender] ?? rawLender;
    const modelled = !!LENDERS[engineName] && !UNMODELLED.has(rawLender);

    const contractRate = contractPct / 100;
    const termYears = Number(p.term_years) || 5;
    const rateType = String(p.mortgage_type || "Fixed").toLowerCase().startsWith("var")
      ? "variable" as const
      : "fixed" as const;

    // Remaining term drives the whole calculation, so a bad maturity date must
    // not silently become a zero-month penalty.
    const maturity = p.maturity_date ? new Date(p.maturity_date) : null;
    if (!maturity || Number.isNaN(maturity.getTime())) return json({ error: "invalid_maturity_date" }, 400);
    const monthsRemaining = Math.min(monthsBetween(new Date(), maturity), termYears * 12);
    if (monthsRemaining <= 0) {
      return json({
        penalty_estimate: 0,
        penalty_type: "three_month_interest",
        confidence: "high",
        breakdown: {
          ird: 0, three_month_interest: 0, derived_discount: 0, comparison_rate: 0,
          remaining_months: 0, posted_rate_at_funding: 0,
        },
        note: "The term has already matured, so there is no prepayment penalty.",
      });
    }

    const { discount, postedAtFunding, inferred } = modelled
      ? derivedDiscount(engineName, contractRate, termYears)
      : { discount: 0, postedAtFunding: 0, inferred: false };

    const comparison = deriveComparisonRate(engineName, monthsRemaining);

    const input: PenaltyInput = {
      lender: engineName,
      balance,
      contractRate,
      monthsRemaining,
      originalTermMonths: termYears * 12,
      discount,
      currentRate: comparison.rate,
      rateType,
      // CIBC amortizes on the real payment; without it the engine flags itself.
      monthlyPayment: Number(p.monthly_payment) || undefined,
      cashback: Number(p.cashback) || 0,
      monthsElapsed: Math.max(0, termYears * 12 - monthsRemaining),
    };

    const r = calculatePenalty(input);

    const notes: string[] = [...(r.notes || [])];
    if (inferred) {
      notes.push(
        `Original discount inferred from the ${engineName} posted ${Math.round(termYears)}yr rate at funding; the payout desk uses the discount on file.`,
      );
    }
    if (!modelled) {
      notes.push(
        `${rawLender} has no researched IRD method in the engine, so this is a generic approximation and understates posted-rate lenders.`,
      );
    }
    if (r.upperBound) notes.push("This lender applies a present-value credit, so the actual charge will be lower.");

    return json({
      penalty_estimate: r.penalty,
      penalty_type: r.binding === "IRD" ? "ird" : "three_month_interest",
      confidence: modelled ? mapConfidence(r.confidence) : "low",
      breakdown: {
        ird: r.ird,
        three_month_interest: r.threeMonthInterest,
        derived_discount: Math.round(discount * 1e6) / 1e6,
        comparison_rate: r.comparisonRate ?? 0,
        remaining_months: Math.round(monthsRemaining * 100) / 100,
        posted_rate_at_funding: postedAtFunding,
      },
      // Everything below is additive; the quiz ignores what it does not read.
      engine: {
        lender: r.lender,
        modelled,
        method: r.method,
        camp: r.camp,
        binding: r.binding,
        engine_confidence: r.confidence,
        comparison_source: comparison.source,
        add_on: r.addOn ?? null,
        cashback_clawback: r.cashbackClawback,
        flags: r.flags,
        upper_bound: r.upperBound,
        do_not_quote: r.doNotQuote,
        rates_as_of: RATES_AS_OF,
        rates_source: ratesSource,
      },
      note: notes.join(" "),
    });
  } catch (e) {
    return json({ error: "internal", detail: String(e instanceof Error ? e.message : e) }, 500);
  }
});
