import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Map remaining months to nearest available term key in market_rates. */
function termKeyForMonths(months: number): string {
  if (months <= 14) return "1yr_fixed";
  if (months <= 30) return "2yr_fixed";
  if (months <= 42) return "3yr_fixed";
  if (months <= 54) return "4yr_fixed";
  return "5yr_fixed";
}

/** Validate and sanitize input parameters */
function validateInput(body: unknown): {
  lender: string;
  mortgage_type: string;
  contract_rate: number;
  term_years: number;
  maturity_date: string;
  balance: number;
} {
  if (!body || typeof body !== "object") {
    throw new Error("VALIDATION");
  }

  const b = body as Record<string, unknown>;

  const lender = typeof b.lender === "string" ? b.lender.trim().slice(0, 100) : "";
  if (!lender) throw new Error("VALIDATION");

  const mortgage_type = b.mortgage_type;
  if (mortgage_type !== "Fixed" && mortgage_type !== "Variable") {
    throw new Error("VALIDATION");
  }

  const contract_rate = Number(b.contract_rate);
  if (!Number.isFinite(contract_rate) || contract_rate < 0 || contract_rate > 25) {
    throw new Error("VALIDATION");
  }

  const term_years = Number(b.term_years);
  if (!Number.isInteger(term_years) || term_years < 1 || term_years > 10) {
    throw new Error("VALIDATION");
  }

  const maturity_date = String(b.maturity_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(maturity_date)) {
    throw new Error("VALIDATION");
  }
  const parsed = new Date(maturity_date);
  if (isNaN(parsed.getTime())) throw new Error("VALIDATION");

  const balance = Number(b.balance);
  if (!Number.isFinite(balance) || balance < 1000 || balance > 100_000_000) {
    throw new Error("VALIDATION");
  }

  return { lender, mortgage_type, contract_rate, term_years, maturity_date, balance };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const { mortgage_type, contract_rate, maturity_date, balance } = validateInput(rawBody);

    // Calculate remaining months
    const now = new Date();
    const maturity = new Date(maturity_date);
    const remainingMs = maturity.getTime() - now.getTime();
    const remainingMonths = Math.max(
      0,
      Math.ceil(remainingMs / (1000 * 60 * 60 * 24 * 30.44))
    );

    // 3-month interest penalty (always computed)
    const threeMonthInterest =
      Math.round((balance * (contract_rate / 100) * 3) / 12 * 100) / 100;

    // Variable rate → always 3-month interest
    if (mortgage_type === "Variable") {
      return new Response(
        JSON.stringify({
          penalty_estimate: threeMonthInterest,
          penalty_type: "three_month_interest",
          confidence: "high",
          breakdown: {
            three_month_interest: threeMonthInterest,
            ird: null,
            remaining_months: remainingMonths,
            comparison_rate: null,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fixed rate → need comparison rate from market_rates for IRD
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const termKey = termKeyForMonths(remainingMonths);
    const { data, error } = await supabase
      .from("market_rates")
      .select("rate")
      .eq("term_key", termKey)
      .eq("rate_type", "uninsured")
      .single();

    if (error) {
      console.error("Failed to fetch comparison rate:", error);
      // Fall back to 3-month interest if we can't get the comparison rate
      return new Response(
        JSON.stringify({
          penalty_estimate: threeMonthInterest,
          penalty_type: "three_month_interest",
          confidence: "low",
          breakdown: {
            three_month_interest: threeMonthInterest,
            ird: null,
            remaining_months: remainingMonths,
            comparison_rate: null,
            note: "Could not fetch comparison rate; using 3-month interest only",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const comparisonRate = Number(data.rate);

    // IRD = (contract_rate - comparison_rate) / 100 × balance × remaining_months / 12
    const rateDiff = (contract_rate - comparisonRate) / 100;
    const ird =
      rateDiff > 0
        ? Math.round(rateDiff * balance * remainingMonths / 12 * 100) / 100
        : 0;

    const penalty = Math.max(threeMonthInterest, ird);
    const penaltyType = ird > threeMonthInterest ? "ird" : "three_month_interest";

    return new Response(
      JSON.stringify({
        penalty_estimate: penalty,
        penalty_type: penaltyType,
        confidence: "medium",
        breakdown: {
          three_month_interest: threeMonthInterest,
          ird,
          remaining_months: remainingMonths,
          comparison_rate: comparisonRate,
          comparison_term: termKey,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("penalty-estimator error:", err);

    if (err instanceof Error && err.message === "VALIDATION") {
      return new Response(
        JSON.stringify({ error: "Invalid input parameters. Please check your values and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unable to calculate penalty estimate. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
