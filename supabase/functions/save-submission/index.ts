import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateSubmission(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") throw new Error("VALIDATION");
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().slice(0, 255) : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("VALIDATION");

  const first_name = typeof b.first_name === "string" ? b.first_name.trim().slice(0, 100) : null;
  const lender = typeof b.lender === "string" ? b.lender.trim().slice(0, 100) : null;
  const mortgage_type = typeof b.mortgage_type === "string" ? b.mortgage_type.trim().slice(0, 20) : null;
  const payment_frequency = typeof b.payment_frequency === "string" ? b.payment_frequency.trim().slice(0, 20) : null;
  const selected_option = typeof b.selected_option === "string" ? b.selected_option.trim().slice(0, 100) : "";

  const mortgage_balance = Number(b.mortgage_balance);
  const current_rate = Number(b.current_rate);
  const comparable_rate = Number(b.comparable_rate);
  const yearly_savings = Number(b.yearly_savings);
  const payment = Number(b.payment);
  const grade = Number(b.grade);
  const penalty = Number(b.penalty);
  const breakeven_months = Number(b.breakeven_months);
  const term = Number(b.term);

  const renewal_date = typeof b.renewal_date === "string" ? b.renewal_date.slice(0, 10) : null;

  return {
    email: email || null,
    first_name,
    lender,
    balance: Number.isFinite(mortgage_balance) ? mortgage_balance : null,
    rate: Number.isFinite(current_rate) ? current_rate : null,
    rate_difference: Number.isFinite(current_rate) && Number.isFinite(comparable_rate)
      ? Math.round((current_rate - comparable_rate) * 100) / 100
      : null,
    yearly_savings: Number.isFinite(yearly_savings) ? yearly_savings : null,
    renewal_date,
    grade: Number.isFinite(grade) ? grade : null,
    payment: Number.isFinite(payment) ? payment : null,
    payment_frequency,
    mortgage_type,
    term: Number.isFinite(term) ? term : null,
    penalty_estimate: Number.isFinite(penalty) ? penalty : null,
    breakeven_months: Number.isFinite(breakeven_months) ? breakeven_months : null,
    report_requested: selected_option.includes("report"),
    alerts_requested: selected_option.includes("alerts"),
    call_requested: selected_option.includes("call"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const data = validateSubmission(rawBody);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("mortgage_submissions").insert(data);
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("save-submission error:", err);

    if (err instanceof Error && err.message === "VALIDATION") {
      return new Response(
        JSON.stringify({ error: "Invalid submission data." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unable to save submission. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
