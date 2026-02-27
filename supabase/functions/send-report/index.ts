const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateReportRequest(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") throw new Error("VALIDATION");
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().slice(0, 255) : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("VALIDATION");

  const firstName = typeof b.firstName === "string" ? b.firstName.trim().slice(0, 100) : "there";

  return { ...b, email, firstName };
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const data = validateReportRequest(rawBody);

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const grade = Number(data.grade) || 0;
    const currentRate = Number(data.currentRate) || 0;
    const comparableRate = Number(data.comparableRate) || 0;
    const yearlySavings = Number(data.yearlySavings) || 0;
    const balance = Number(data.mortgageBalance) || 0;
    const penalty = Number(data.penalty) || 0;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a2e;">Your Mortgage Grade Report</h1>
        <p>Hi ${data.firstName},</p>
        <p>Here's your personalized mortgage analysis:</p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h2 style="margin-top: 0;">Grade: ${grade}/5 ⭐</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Your Rate</td><td style="text-align: right; font-weight: bold;">${currentRate}%</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Best Available</td><td style="text-align: right; font-weight: bold; color: #10b981;">${comparableRate}%</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Balance</td><td style="text-align: right; font-weight: bold;">${formatCurrency(balance)}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Est. Yearly Savings</td><td style="text-align: right; font-weight: bold; color: #10b981;">${formatCurrency(yearlySavings)}</td></tr>
            ${penalty > 0 ? `<tr><td style="padding: 8px 0; color: #666;">Est. Penalty</td><td style="text-align: right; font-weight: bold; color: #ef4444;">${formatCurrency(penalty)}</td></tr>` : ""}
          </table>
        </div>
        
        <p>Want to discuss your options? Call us at <a href="tel:604-262-3500">604-262-3500</a>.</p>
        <p style="color: #999; font-size: 12px;">Flow Mortgage Co. | <a href="mailto:unsubscribe@flowmortgage.ca">Unsubscribe</a></p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Flow Mortgage <reports@flowmortgage.ca>",
        to: [data.email],
        subject: `Your Mortgage Grade: ${grade}/5`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      throw new Error("EMAIL_SEND_FAILED");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-report error:", err);

    if (err instanceof Error && err.message === "VALIDATION") {
      return new Response(
        JSON.stringify({ error: "Invalid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unable to send report. Please try again later." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
