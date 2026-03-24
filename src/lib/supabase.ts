import { createClient } from "@supabase/supabase-js";
import type { RateData, PenaltyEstimate, QuizResult } from "@/types";
import { getFallbackRates } from "./calculations";

// These will be set when you create your Supabase project
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Rate cache (1 hour)
let rateCache: { data: RateData; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000;

/**
 * Fetch live market rates via edge function, with caching and fallback.
 */
export async function fetchMarketRates(): Promise<RateData> {
  if (rateCache && Date.now() - rateCache.timestamp < CACHE_DURATION) {
    return rateCache.data;
  }

  if (!supabase) {
    console.warn("Supabase not configured, using fallback rates");
    return getFallbackRates();
  }

  try {
    const { data, error } = await supabase.functions.invoke("scrape-rates");
    if (error) throw error;

    const rates: RateData = {
      fiveYearFixed: data.fiveYearFixed ?? 4.39,
      fiveYearVariable: data.fiveYearVariable ?? 3.85,
      threeYearFixed: data.threeYearFixed ?? 4.19,
      oneYearFixed: data.oneYearFixed ?? 5.09,
      twoYearFixed: data.twoYearFixed ?? 4.59,
      fourYearFixed: data.fourYearFixed ?? 4.29,
      rates: data.rates,
      scrapedAt: data.scrapedAt,
      source: data.source,
    };

    rateCache = { data: rates, timestamp: Date.now() };
    return rates;
  } catch (err) {
    console.error("Failed to fetch rates, using fallback:", err);
    return getFallbackRates();
  }
}

/**
 * Estimate mortgage penalty via edge function.
 */
export async function fetchPenaltyEstimate(params: {
  lender: string;
  mortgageType: string;
  contractRate: number;
  termYears: number;
  maturityDate: string;
  balance: number;
}): Promise<PenaltyEstimate | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.functions.invoke(
      "mortgage-penalty-estimator",
      {
        body: {
          lender: params.lender,
          mortgage_type: params.mortgageType,
          contract_rate: params.contractRate,
          term_years: params.termYears,
          maturity_date: params.maturityDate,
          balance: params.balance,
        },
      }
    );
    if (error) throw error;
    return data as PenaltyEstimate;
  } catch (err) {
    console.error("Penalty estimation failed:", err);
    return null;
  }
}

/**
 * Save quiz submission to database.
 */
export async function saveSubmission(
  result: QuizResult,
  email: string,
  selectedOption: string
): Promise<void> {
  if (!supabase) {
    console.warn("Supabase not configured, skipping save");
    return;
  }

  try {
    const { error } = await supabase.functions.invoke("save-submission", {
      body: {
        email,
        first_name: result.firstName,
        lender: result.lender,
        mortgage_balance: result.balance,
        current_rate: result.currentRate,
        renewal_date: result.renewalDate,
        grade: result.grade,
        comparable_rate: result.comparableRate,
        yearly_savings: result.yearlySavings,
        selected_option: selectedOption,
        payment: result.payment,
        payment_frequency: result.paymentFrequency,
        amortization_years: result.amortizationYears,
        amortization_months: result.amortizationMonths,
        total_savings_potential: result.totalSavingsPotential,
        penalty: result.penalty,
        breakeven_months: result.breakevenMonths,
        comparable_payment: result.comparablePayment,
        penalty_type: result.penaltyType,
        penalty_confidence: result.penaltyConfidence,
        mortgage_type: result.mortgageType,
        term: result.term,
      },
    });
    if (error) throw error;
  } catch (err) {
    console.error("Failed to save submission:", err);
  }
}

/**
 * Send email report to user.
 */
export async function sendReport(
  result: QuizResult,
  email: string,
  wantReport: boolean,
  wantAlerts: boolean
): Promise<void> {
  if (!supabase) return;

  try {
    const { error } = await supabase.functions.invoke("send-report", {
      body: {
        email,
        firstName: result.firstName,
        lender: result.lender,
        term: result.term,
        mortgageType: result.mortgageType,
        mortgageBalance: result.balance,
        currentRate: result.currentRate,
        comparableRate: result.comparableRate,
        yearlySavings: result.yearlySavings,
        renewalDate: result.renewalDate,
        grade: result.grade,
        payment: result.payment,
        paymentFrequency: result.paymentFrequency,
        penalty: result.penalty,
        breakevenMonths: result.breakevenMonths,
        totalSavingsPotential: result.totalSavingsPotential,
        comparablePayment: result.comparablePayment,
        amortizationYears: result.amortizationYears,
        amortizationMonths: result.amortizationMonths,
        isNegativeAmort: result.isNegativeAmort,
        amortStatus: result.amortStatus,
        wantReport,
        wantAlerts,
      },
    });
    if (error) throw error;
  } catch (err) {
    console.error("Failed to send report:", err);
  }
}

// Lender code mapping for penalty estimator
export const LENDER_CODES: Record<string, string> = {
  "TD Bank": "TD",
  "RBC": "RBC",
  "Scotiabank": "BNS",
  "BMO": "BMO",
  "CIBC": "CIBC",
  "National Bank": "NBC",
  "First National": "FN",
  "MCAP": "MCAP",
  "CMLS": "CMLS",
  "RMG": "RMG",
  "Manulife": "MANULIFE",
  "B2B Bank": "B2B",
  "Meridian": "MERIDIAN",
};
