const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateLead(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") throw new Error("VALIDATION");
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().slice(0, 255) : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("VALIDATION");

  const first_name = typeof b.first_name === "string" ? b.first_name.trim().slice(0, 100) : "";
  if (!first_name) throw new Error("VALIDATION");

  return b;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    validateLead(rawBody);

    const ZOHO_WEBHOOK_URL = Deno.env.get("ZOHO_WEBHOOK_URL");
    if (!ZOHO_WEBHOOK_URL) {
      console.warn("ZOHO_WEBHOOK_URL not configured, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(ZOHO_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawBody),
    });

    if (!res.ok) {
      console.error("Zoho webhook returned:", res.status);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("submit-lead error:", err);

    if (err instanceof Error && err.message === "VALIDATION") {
      return new Response(
        JSON.stringify({ error: "Invalid lead data." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unable to submit lead. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
