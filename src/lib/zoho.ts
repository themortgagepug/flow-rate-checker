import type { QuizResult } from "@/types";
import { supabase } from "@/lib/supabase";

/**
 * Push lead data to Zoho CRM via server-side edge function.
 * The webhook URL is stored as a server secret, not exposed to clients.
 */
export async function pushToZohoCRM(
  result: QuizResult,
  email: string,
  selectedOptions: string[]
): Promise<void> {
  if (!supabase) {
    console.warn("Supabase not configured, skipping Zoho push");
    return;
  }

  try {
    const { error } = await supabase.functions.invoke("submit-lead", {
      body: {
        // Contact fields
        first_name: result.firstName,
        email,
        lead_source: "Rate My Rate Tool",

        // Mortgage details
        current_rate: result.currentRate,
        comparable_rate: result.comparableRate,
        lender: result.lender,
        mortgage_balance: result.balance,
        mortgage_type: result.mortgageType,
        term_years: result.term,
        renewal_date: result.renewalDate,
        payment: result.payment,
        payment_frequency: result.paymentFrequency,

        // Analysis results
        grade: result.grade,
        yearly_savings: result.yearlySavings,
        total_savings_potential: result.totalSavingsPotential,
        penalty_estimate: result.penalty,
        breakeven_months: result.breakevenMonths,
        comparable_payment: result.comparablePayment,
        amortization_years: result.amortizationYears,
        amortization_months: result.amortizationMonths,

        // User selections
        wants_report: selectedOptions.includes("report"),
        wants_alerts: selectedOptions.includes("alerts"),
        wants_call: selectedOptions.includes("call"),

        // Metadata
        submitted_at: new Date().toISOString(),
      },
    });

    if (error) throw error;
  } catch (err) {
    console.error("Failed to push to Zoho CRM:", err);
  }
}
