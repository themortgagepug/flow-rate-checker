import type { QuizAnswers, QuizResult, RateData } from "@/types";

/**
 * Convert annual rate to effective monthly rate using
 * Canadian semi-annual compounding (legally mandated).
 */
export function toMonthlyRate(annualRate: number): number {
  const semiAnnual = annualRate / 100 / 2;
  return Math.pow(1 + semiAnnual, 1 / 6) - 1;
}

/**
 * Standard amortization monthly payment calculation.
 */
export function calculateMonthlyPayment(
  balance: number,
  annualRate: number,
  amortMonths: number
): number {
  const r = toMonthlyRate(annualRate);
  if (r === 0) return balance / amortMonths;
  return (
    balance * (r * Math.pow(1 + r, amortMonths)) /
    (Math.pow(1 + r, amortMonths) - 1)
  );
}

/**
 * Adjust monthly payment to the selected frequency.
 */
export function adjustForFrequency(
  monthlyPayment: number,
  frequency: "Monthly" | "Bi-weekly" | "Weekly"
): number {
  switch (frequency) {
    case "Bi-weekly":
      return monthlyPayment * 12 / 26;
    case "Weekly":
      return monthlyPayment * 12 / 52;
    default:
      return monthlyPayment;
  }
}

/**
 * Normalize any frequency payment back to monthly.
 */
function toMonthlyPayment(
  payment: number,
  frequency: "Monthly" | "Bi-weekly" | "Weekly"
): number {
  switch (frequency) {
    case "Bi-weekly":
      return payment * 26 / 12;
    case "Weekly":
      return payment * 52 / 12;
    default:
      return payment;
  }
}

/**
 * Calculate remaining amortization from current balance, rate, and payment.
 */
export function calculateRemainingAmortization(
  balance: number,
  annualRate: number,
  payment: number,
  frequency: "Monthly" | "Bi-weekly" | "Weekly"
): { years: number; months: number } {
  const r = toMonthlyRate(annualRate);
  const monthlyPmt = toMonthlyPayment(payment, frequency);

  // Negative amortization — payment doesn't cover interest
  if (monthlyPmt <= balance * r) {
    return { years: 99, months: 0 };
  }

  const totalMonths =
    -Math.log(1 - (balance * r) / monthlyPmt) / Math.log(1 + r);
  const rounded =
    Math.abs(totalMonths - Math.round(totalMonths)) < 0.1
      ? Math.round(totalMonths)
      : Math.ceil(totalMonths);

  return {
    years: Math.floor(rounded / 12),
    months: rounded % 12,
  };
}

/**
 * Determine amortization status.
 */
export function getAmortStatus(
  balance: number,
  annualRate: number,
  payment: number,
  frequency: "Monthly" | "Bi-weekly" | "Weekly"
): "normal" | "negative" | "interest-only" {
  const r = toMonthlyRate(annualRate);
  const interestOnly = balance * r;
  const monthlyPmt = toMonthlyPayment(payment, frequency);

  if (monthlyPmt < interestOnly) return "negative";
  if (Math.abs(monthlyPmt - interestOnly) < 1) return "interest-only";
  return "normal";
}

/**
 * Find the best comparable rate for the user's term and type.
 */
export function getComparableRate(
  term: number,
  type: "Fixed" | "Variable",
  rateData: RateData
): number {
  if (type === "Variable") {
    return rateData.fiveYearVariable;
  }

  switch (term) {
    case 1:
      return rateData.oneYearFixed;
    case 2:
      return rateData.twoYearFixed;
    case 3:
      return rateData.threeYearFixed;
    case 4:
      return rateData.fourYearFixed;
    case 5:
    default:
      return rateData.fiveYearFixed;
  }
}

/**
 * Calculate the star grade (1-5) based on rate difference.
 */
export function calculateGrade(
  currentRate: number,
  comparableRate: number
): number {
  const diff = currentRate - comparableRate;
  if (diff > 2) return 1;
  if (diff > 1) return 2;
  if (diff > 0.5) return 3;
  if (diff > 0) return 4;
  return 5;
}

/**
 * Estimate penalty as 3 months' interest (fallback).
 */
export function estimatePenalty(
  balance: number,
  annualRate: number
): number {
  return Math.round(balance * (annualRate / 100) * 3 / 12);
}

/**
 * Calculate break-even months after penalty.
 */
export function calculateBreakeven(
  penalty: number,
  monthlySavings: number
): number {
  if (monthlySavings <= 0) return 0;
  return Math.ceil(penalty / monthlySavings);
}

/**
 * Fallback rate data if the scrape function fails.
 */
export function getFallbackRates(): RateData {
  return {
    fiveYearFixed: 4.29,
    fiveYearVariable: 3.99,
    threeYearFixed: 4.09,
    oneYearFixed: 4.99,
    twoYearFixed: 4.19,
    fourYearFixed: 4.24,
  };
}

/**
 * Master function: compute all results from quiz answers + rate data.
 */
export function computeResults(
  answers: QuizAnswers,
  rateData: RateData,
  penaltyOverride?: number
): QuizResult {
  const comparableRate = getComparableRate(answers.term, answers.type, rateData);
  const grade = calculateGrade(answers.rate, comparableRate);

  // Yearly + monthly savings
  const yearlySavings = Math.round(
    ((answers.rate - comparableRate) / 100) * answers.balance
  );
  const monthlySavings =
    ((answers.rate - comparableRate) / 100) * answers.balance / 12;

  // Amortization
  const amort = calculateRemainingAmortization(
    answers.balance,
    answers.rate,
    answers.payment,
    answers.paymentFrequency
  );
  const amortStatus = getAmortStatus(
    answers.balance,
    answers.rate,
    answers.payment,
    answers.paymentFrequency
  );

  // Penalty
  const penalty =
    penaltyOverride ?? estimatePenalty(answers.balance, answers.rate);

  // Break-even
  const breakevenMonths = calculateBreakeven(penalty, monthlySavings);

  // Total savings potential (net of penalty, over remaining term)
  const renewalDate = new Date(answers.renewalDate);
  const now = new Date();
  const yearsRemaining = Math.max(
    0,
    (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  );
  const totalSavingsPotential = Math.max(
    0,
    Math.floor(yearlySavings * yearsRemaining) - penalty
  );

  // Comparable payment at the better rate
  const amortTotalMonths = amort.years * 12 + amort.months;
  const comparableMonthly = amortTotalMonths > 0
    ? calculateMonthlyPayment(answers.balance, comparableRate, amortTotalMonths)
    : 0;
  const comparablePayment = Math.floor(
    adjustForFrequency(comparableMonthly, answers.paymentFrequency)
  );

  return {
    grade,
    currentRate: answers.rate,
    comparableRate,
    yearlySavings: Math.max(0, yearlySavings),
    monthlySavings: Math.max(0, monthlySavings),
    penalty,
    breakevenMonths,
    totalSavingsPotential,
    comparablePayment,
    amortizationYears: amort.years,
    amortizationMonths: amort.months,
    isNegativeAmort: amort.years >= 99,
    amortStatus,
    renewalDate: answers.renewalDate,
    lender: answers.lender,
    balance: answers.balance,
    term: answers.term,
    mortgageType: answers.type,
    payment: answers.payment,
    paymentFrequency: answers.paymentFrequency,
    firstName: answers.firstName,
  };
}
