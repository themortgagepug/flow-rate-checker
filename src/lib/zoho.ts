import type { QuizResult } from "@/types";

const ZOHO_WEBHOOK_URL = import.meta.env.VITE_ZOHO_WEBHOOK_URL || "";

/**
 * Push lead data to Zoho CRM via webhook.
 * Configure a Zoho Flow / webhook to receive this payload
 * and create a Contact + Deal in your CRM.
 */
export async function pushToZohoCRM(
  result: QuizResult,
  email: string,
  selectedOptions: string[]
): Promise<void> {
  if (!ZOHO_WEBHOOK_URL) {
    console.warn("Zoho webhook URL not configured");
    return;
  }

  try {
    await fetch(ZOHO_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
  } catch (err) {
    console.error("Failed to push to Zoho CRM:", err);
  }
}
