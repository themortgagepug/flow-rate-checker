import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("market_rates")
      .select("term_key, rate, rate_type, source, updated_at")
      .eq("rate_type", "uninsured");

    if (error) throw error;

    // Map DB term_key → frontend field names
    const keyMap: Record<string, string> = {
      "1yr_fixed": "oneYearFixed",
      "2yr_fixed": "twoYearFixed",
      "3yr_fixed": "threeYearFixed",
      "4yr_fixed": "fourYearFixed",
      "5yr_fixed": "fiveYearFixed",
      "5yr_variable": "fiveYearVariable",
      "10yr_fixed": "tenYearFixed",
    };

    const rates: Record<string, number> = {};
    const allRates: Record<string, number> = {};
    let latestUpdated = "";
    let source = "";

    for (const row of data ?? []) {
      const frontendKey = keyMap[row.term_key];
      if (frontendKey) {
        rates[frontendKey] = Number(row.rate);
      }
      allRates[row.term_key] = Number(row.rate);
      if (!latestUpdated || row.updated_at > latestUpdated) {
        latestUpdated = row.updated_at;
      }
      if (row.source) source = row.source;
    }

    return new Response(
      JSON.stringify({
        ...rates,
        rates: allRates,
        scrapedAt: latestUpdated,
        source,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("scrape-rates error:", err);
    return new Response(JSON.stringify({ error: "Unable to fetch rates. Please try again later." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
