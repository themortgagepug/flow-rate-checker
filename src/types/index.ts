export interface QuizAnswers {
  rate: number;
  lender: string;
  lenderCustom?: string;
  balance: number;
  type: "Fixed" | "Variable";
  term: number;
  renewalDate: string;
  payment: number;
  paymentFrequency: "Monthly" | "Bi-weekly" | "Weekly";
  firstName: string;
}

export interface RateData {
  fiveYearFixed: number;
  fiveYearVariable: number;
  threeYearFixed: number;
  oneYearFixed: number;
  twoYearFixed: number;
  fourYearFixed: number;
  rates?: MarketRate[];
  scrapedAt?: string;
  source?: string;
}

export interface MarketRate {
  term: string;
  type: string;
  rate: number;
  lender?: string;
}

export interface PenaltyEstimate {
  penalty_estimate: number;
  penalty_type: "ird" | "three_month_interest";
  confidence: "high" | "medium" | "low";
  breakdown: {
    ird: number;
    three_month_interest: number;
    derived_discount: number;
    comparison_rate: number;
    remaining_months: number;
    posted_rate_at_funding: number;
  };
  note?: string;
}

export interface ScenarioResult {
  newPayment: number;
  paymentSavings: number;
  totalInterestCurrent: number;
  totalInterestNew: number;
  totalInterestSaved: number;
  netSavings: number;
  amortMonths: number;
}

export interface QuizResult {
  grade: number;
  currentRate: number;
  comparableRate: number;
  yearlySavings: number;
  monthlySavings: number;
  penalty: number;
  penaltyType?: string;
  penaltyConfidence?: string;
  breakevenMonths: number;
  totalSavingsPotential: number;
  comparablePayment: number;
  amortizationYears: number;
  amortizationMonths: number;
  isNegativeAmort: boolean;
  amortStatus: "normal" | "negative" | "interest-only";
  renewalDate: string;
  lender: string;
  balance: number;
  term: number;
  mortgageType: string;
  payment: number;
  paymentFrequency: string;
  firstName: string;
  penaltyBreakdown?: PenaltyEstimate["breakdown"];
  switchingCosts: number;
  legalFees: number;
  dischargeFee: number;
  scenarioFresh: ScenarioResult;
  scenarioMatch: ScenarioResult;
}

export type QuizStep =
  | "rate"
  | "lender"
  | "balance"
  | "type"
  | "term"
  | "renewalDate"
  | "payment"
  | "firstName";

export interface LenderOption {
  label: string;
  value: string;
  code?: string;
}
