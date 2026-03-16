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
export function toMonthlyPayment(
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
 * Estimate mortgage penalty.
 * For fixed-rate: greater of 3-month interest or IRD.
 * For variable-rate: 3-month interest only.
 */
export function estimatePenalty(
  balance: number,
  annualRate: number,
  mortgageType: "Fixed" | "Variable" = "Fixed",
  comparableRate?: number,
  remainingMonths?: number
): number {
  const threeMonthInterest = balance * (annualRate / 100) * 3 / 12;

  if (mortgageType === "Variable" || !comparableRate || !remainingMonths) {
    return Math.round(threeMonthInterest * 100) / 100;
  }

  // IRD: (contract_rate - comparison_rate) × balance × remaining_months / 12
  const rateDiff = (annualRate - comparableRate) / 100;
  const ird = rateDiff > 0 ? rateDiff * balance * remainingMonths / 12 : 0;

  return Math.round(Math.max(threeMonthInterest, ird) * 100) / 100;
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
    fiveYearFixed: 3.69,
    fiveYearVariable: 3.40,
    threeYearFixed: 3.49,
    oneYearFixed: 4.74,
    twoYearFixed: 4.29,
    fourYearFixed: 3.89,
  };
}

/**
 * Calculate total interest paid over a specific number of months
 * using month-by-month amortization schedule.
 */
export function calculateInterestOverTerm(
  balance: number,
  annualRate: number,
  amortMonths: number,
  termMonths: number
): number {
  const monthlyPayment = calculateMonthlyPayment(balance, annualRate, amortMonths);
  const r = toMonthlyRate(annualRate);
  let remaining = balance;
  let totalInterest = 0;

  const months = Math.min(termMonths, amortMonths);
  for (let i = 0; i < months && remaining > 0; i++) {
    const interestPortion = remaining * r;
    totalInterest += interestPortion;
    const principalPortion = monthlyPayment - interestPortion;
    remaining = Math.max(0, remaining - principalPortion);
  }

  return totalInterest;
}

/**
 * Compute a scenario: compare current vs new rate over the remaining TERM.
 * Interest savings are calculated over termMonths, not the full amortization.
 */
export function computeScenario(
  balance: number,
  currentRate: number,
  currentMonthlyPayment: number,
  currentAmortMonths: number,
  newRate: number,
  newAmortMonths: number,
  termMonths: number,
  switchingCosts: number
): import("@/types").ScenarioResult {
  const newMonthlyPayment = calculateMonthlyPayment(balance, newRate, newAmortMonths);
  const paymentSavings = currentMonthlyPayment - newMonthlyPayment;

  // Interest paid over the remaining TERM (not full amortization)
  const totalInterestCurrent = calculateInterestOverTerm(balance, currentRate, currentAmortMonths, termMonths);
  const totalInterestNew = calculateInterestOverTerm(balance, newRate, newAmortMonths, termMonths);
  const totalInterestSaved = totalInterestCurrent - totalInterestNew;

  // Total payment savings over remaining term
  const totalPaymentSavings = paymentSavings * termMonths;

  // Net savings = interest saved - switching costs
  const netSavings = totalInterestSaved - switchingCosts;

  return {
    newPayment: Math.round(newMonthlyPayment * 100) / 100,
    paymentSavings: Math.round(paymentSavings * 100) / 100,
    totalInterestCurrent: Math.round(totalInterestCurrent * 100) / 100,
    totalInterestNew: Math.round(totalInterestNew * 100) / 100,
    totalInterestSaved: Math.round(totalInterestSaved * 100) / 100,
    netSavings: Math.round(netSavings * 100) / 100,
    amortMonths: newAmortMonths,
    termMonths,
    totalPaymentSavings: Math.round(totalPaymentSavings * 100) / 100,
  };
}

/**
 * Rate premiums applied to market rates for realistic comparisons.
 * Refinance: +0.35% (always applies — every quiz user is evaluating a refi)
 * 30-year amortization: +0.10% (applies to fresh 30yr scenario only)
 * Rental property: +0.25% (applies when property type is rental)
 */
const REFINANCE_PREMIUM = 0.35;
const THIRTY_YEAR_PREMIUM = 0.10;
const RENTAL_PREMIUM = 0.25;

/**
 * Master function: compute all results from quiz answers + rate data.
 */
export function computeResults(
  answers: QuizAnswers,
  rateData: RateData,
  penaltyOverride?: number
): import("@/types").QuizResult {
  const baseRate = getComparableRate(answers.term, answers.type, rateData);

  // Apply refinance premium to all comparable rates (every user is evaluating a refi)
  const comparableRate = Math.round((baseRate + REFINANCE_PREMIUM) * 100) / 100;

  // Rate for 30-year fresh scenario gets additional 30yr premium
  const freshScenarioRate = Math.round((comparableRate + THIRTY_YEAR_PREMIUM) * 100) / 100;

  // Rental premium would apply here if property type is known
  // TODO: Add property type question to quiz, then apply RENTAL_PREMIUM

  const grade = calculateGrade(answers.rate, comparableRate);

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

  // Penalty — compute remaining months for IRD
  const renewalDate = new Date(answers.renewalDate);
  const now = new Date();
  const remainingMs = renewalDate.getTime() - now.getTime();
  const remainingMonths = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24 * 30.44)));
  const penalty =
    penaltyOverride ?? estimatePenalty(answers.balance, answers.rate, answers.type, comparableRate, remainingMonths);

  // Switching costs
  const legalFees = 1000;
  const dischargeFee = 300;
  const switchingCosts = penalty + legalFees + dischargeFee;

  // Current monthly payment (normalized)
  const currentMonthlyPayment = toMonthlyPayment(answers.payment, answers.paymentFrequency);
  const currentAmortMonths = amort.years * 12 + amort.months;
  const safeCurrentAmort = Math.max(currentAmortMonths, 12); // floor to 1 year
  const safeTermMonths = Math.max(remainingMonths, 1); // remaining term months

  // Scenario A: Fresh 30-year amortization, compared over remaining term
  // Uses freshScenarioRate which includes the 30yr amort premium
  const scenarioFresh = computeScenario(
    answers.balance, answers.rate, currentMonthlyPayment, safeCurrentAmort,
    freshScenarioRate, 360, safeTermMonths, switchingCosts
  );

  // Scenario B: Match current remaining amortization, compared over remaining term
  const scenarioMatch = computeScenario(
    answers.balance, answers.rate, currentMonthlyPayment, safeCurrentAmort,
    comparableRate, safeCurrentAmort, safeTermMonths, switchingCosts
  );

  // Use Scenario B (matched amort) for headline savings
  const monthlySavings = Math.max(0, scenarioMatch.paymentSavings);
  const yearlySavings = Math.round(monthlySavings * 12 * 100) / 100;

  // Break-even using switching costs
  const breakevenMonths = monthlySavings > 0 ? Math.ceil(switchingCosts / monthlySavings) : 0;

  // Total savings potential = net savings from matched scenario
  const totalSavingsPotential = Math.max(0, scenarioMatch.netSavings);

  // Comparable payment at the better rate (matched amort, user's frequency)
  const comparableMonthly = safeCurrentAmort > 0
    ? calculateMonthlyPayment(answers.balance, comparableRate, safeCurrentAmort)
    : 0;
  const comparablePayment = Math.round(
    adjustForFrequency(comparableMonthly, answers.paymentFrequency) * 100
  ) / 100;

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
    switchingCosts,
    legalFees,
    dischargeFee,
    scenarioFresh,
    scenarioMatch,
  };
}
