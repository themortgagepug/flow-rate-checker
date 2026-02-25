import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Map remaining months to nearest available term key in market_rates. */
function termKeyForMonths(months: number): string {
  if (months <= 14) return "1yr_fixed";
  if (months <= 30) return "2yr_fixed";
  if (months <= 42) return "3yr_fixed";
  if (months <= 54) return "4yr_fixed";
  return "5yr_fixed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      lender,
      mortgage_type,
      contract_rate,
      term_years,
      maturity_date,
      balance,
    } = await req.json();

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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
