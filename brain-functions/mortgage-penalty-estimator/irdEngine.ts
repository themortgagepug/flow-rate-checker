// Flow Mortgage Co — verified IRD (Interest Rate Differential) penalty engine.
// Ported from the standalone engine whose logic is unit-tested to the cent
// against every lender's own published worked example (CIBC amortized, BMO,
// National Bank interpolation+$500, RBC, Equitable Standard/Evolution, First
// National, MERIX). Do not "simplify" the per-lender math — the accuracy is the
// whole point of this tool.
//
// Every output is an ESTIMATE. Posted-rate lenders that apply present value
// (RBC, BMO, Scotia) produce a slightly LOWER actual charge — flagged as an
// upper bound. The lender's payout statement is the only authoritative number.
//
// Rates are DECIMALS (0.065 = 6.5%).

export type Camp =
  | 'posted'
  | 'posted-no-discount'
  | 'posted-interpolated'
  | 'contract'
  | 'goc-yield'
  | 'generic';

export type Confidence =
  | 'high'
  | 'med-high'
  | 'moderate'
  | 'low-mechanics'
  | 'estimate-only'
  | 'generic-fallback';

export interface PenaltyInput {
  lender: string;
  balance: number;
  contractRate: number; // decimal
  monthsRemaining: number;
  originalTermMonths?: number;
  discount?: number; // decimal, original discount off posted
  currentRate?: number; // decimal, comparison-side rate (posted / offered / GoC)
  monthlyPayment?: number; // for CIBC amortized
  cashback?: number;
  rateType?: 'fixed' | 'variable';
  originalPostedRate?: number; // NBC
  monthsElapsed?: number; // EQB Standard variable 5/4/3
  nbcAddOnCap?: number;
}

export interface PenaltyResult {
  lender: string;
  penalty: number;
  ird: number;
  threeMonthInterest: number;
  method: string;
  comparisonRate: number | null;
  addOn?: number;
  camp: Camp;
  binding: string;
  cashbackClawback: number | null;
  flags: string[];
  confidence: Confidence;
  notes: string[];
  upperBound: boolean;
  doNotQuote: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundRate = (n: number) => Math.round(n * 1e6) / 1e6;

const threeMonthInterest = (balance: number, rate: number) => (balance * rate) / 4;

const simpleIRD = (balance: number, hiRate: number, loRate: number, months: number) =>
  Math.max(0, hiRate - loRate) * balance * (months / 12);

// Canadian fixed mortgages compound semi-annually.
function amortizedInterest(balance: number, annualRate: number, payment: number, months: number) {
  let bal = balance;
  let interest = 0;
  const mr = Math.pow(1 + annualRate / 2, 1 / 6) - 1;
  for (let i = 0; i < months && bal > 0; i++) {
    const int = bal * mr;
    interest += int;
    bal -= payment - int;
    if (bal < 0) bal = 0;
  }
  return interest;
}

export function interpolateRate(
  months: number,
  shortMonths: number,
  shortRate: number,
  longMonths: number,
  longRate: number,
) {
  if (longMonths === shortMonths) return shortRate;
  return shortRate + ((longRate - shortRate) * (months - shortMonths)) / (longMonths - shortMonths);
}

interface Computed {
  ird: number;
  threeMo: number;
  method: string;
  comparisonRate?: number;
  addOn?: number;
  flags: string[];
}

interface LenderDef {
  camp: Camp;
  confidence: Confidence;
  label: string;
  compute: (i: PenaltyInput) => Computed;
  cashback: (i: PenaltyInput) => number | null;
  variableMonths?: (i: PenaltyInput) => number;
  notes: string[];
}

const postedMinusDiscount = (flags: string[] = []) => (i: PenaltyInput): Computed => {
  const comparison = (i.currentRate ?? 0) - (i.discount || 0);
  return {
    ird: simpleIRD(i.balance, i.contractRate, comparison, i.monthsRemaining),
    threeMo: threeMonthInterest(i.balance, i.contractRate),
    method: 'simple',
    comparisonRate: comparison,
    flags,
  };
};

const contractSimple = (opts: { addDiscountToBorrower?: boolean; flags?: string[] } = {}) => (
  i: PenaltyInput,
): Computed => {
  const borrower = i.contractRate + (opts.addDiscountToBorrower ? i.discount || 0 : 0);
  return {
    ird: simpleIRD(i.balance, borrower, i.currentRate ?? 0, i.monthsRemaining),
    threeMo: threeMonthInterest(i.balance, borrower),
    method: 'simple',
    comparisonRate: i.currentRate ?? 0,
    flags: opts.flags || [],
  };
};

const prorata = (i: PenaltyInput) =>
  i.originalTermMonths ? (i.monthsRemaining / i.originalTermMonths) * (i.cashback || 0) : null;

export const LENDERS: Record<string, LenderDef> = {
  RBC: { camp: 'posted', confidence: 'high', label: 'RBC Royal Bank', compute: postedMinusDiscount(['upper-bound-pv']), cashback: prorata, notes: ['RBC applies present value; actual charge is lower than this estimate.'] },
  TD: { camp: 'posted', confidence: 'med-high', label: 'TD Canada Trust', compute: postedMinusDiscount(['term-rounding-unverified']), cashback: (i) => (i.originalTermMonths ? (i.cashback || 0) * (i.monthsRemaining / i.originalTermMonths) : null), notes: ['Term-rounding and PV treatment not published by TD.'] },
  SCOTIA: { camp: 'posted', confidence: 'high', label: 'Scotiabank', compute: postedMinusDiscount(['upper-bound-pv']), cashback: (i) => (i.originalTermMonths ? (Math.ceil(i.monthsRemaining) / i.originalTermMonths) * (i.cashback || 0) : null), notes: ['Scotia may apply present value; treat as upper bound.'] },
  BMO: { camp: 'posted', confidence: 'high', label: 'BMO', compute: postedMinusDiscount(['upper-bound-pv']), cashback: (i) => (i.monthsRemaining / 60) * (i.cashback || 0), notes: ['BMO applies a present-value credit; actual charge is slightly lower.'] },
  CIBC: {
    camp: 'posted', confidence: 'high', label: 'CIBC',
    compute: (i) => {
      const borrower = i.contractRate + (i.discount || 0);
      const iBorrow = amortizedInterest(i.balance, borrower, i.monthlyPayment || 0, i.monthsRemaining);
      const iComp = amortizedInterest(i.balance, i.currentRate ?? 0, i.monthlyPayment || 0, i.monthsRemaining);
      return { ird: Math.max(0, iBorrow - iComp), threeMo: threeMonthInterest(i.balance, borrower), method: 'amortized', comparisonRate: i.currentRate ?? 0, flags: i.monthlyPayment ? [] : ['missing-payment'] };
    },
    cashback: () => null,
    notes: ['CIBC uses an amortized (declining-balance) method; needs the monthly payment.'],
  },
  NBC: {
    camp: 'posted-interpolated', confidence: 'high', label: 'National Bank',
    compute: (i) => {
      const hi = i.originalPostedRate != null ? i.originalPostedRate : i.contractRate;
      let lo = i.currentRate ?? 0;
      lo = Math.round(lo * 10000) / 10000;
      const base = simpleIRD(i.balance, hi, lo, i.monthsRemaining);
      const addOn = Math.min((i.balance * hi) / 12, i.nbcAddOnCap != null ? i.nbcAddOnCap : 500);
      return { ird: base + addOn, threeMo: threeMonthInterest(i.balance, hi), method: 'simple+addon', comparisonRate: lo, addOn, flags: [] };
    },
    cashback: prorata,
    notes: ['Adds one month of interest (max $500) on top of IRD; comparison rate is interpolated.'],
  },
  CMLS: { camp: 'posted-no-discount', confidence: 'low-mechanics', label: 'CMLS Financial', compute: contractSimple({ flags: ['mechanics-unverified'] }), cashback: () => null, notes: ['Posted-rate basis confirmed; term selection unverified — confirm at payout. No cash-back product.'] },
  MANULIFE: { camp: 'posted', confidence: 'moderate', label: 'Manulife Bank', compute: contractSimple({ flags: ['primary-source-blocked'] }), cashback: () => null, notes: ['Method per secondary source — confirm at payout.'] },
  MCAP: { camp: 'contract', confidence: 'moderate', label: 'MCAP', compute: contractSimple(), cashback: () => null, notes: ['Contract-to-current per consensus; confirm at payout for edge files.'] },
  FIRST_NATIONAL: { camp: 'contract', confidence: 'high', label: 'First National', compute: contractSimple(), cashback: (i) => (i.originalTermMonths ? (i.cashback || 0) * (i.monthsRemaining / i.originalTermMonths) : null), notes: [] },
  MERIX: { camp: 'contract', confidence: 'high', label: 'MERIX / Lendwise', compute: contractSimple(), cashback: () => null, notes: [] },
  TANGERINE: { camp: 'contract', confidence: 'moderate', label: 'Tangerine', compute: contractSimple({ flags: ['borrower-rate-unverified'] }), cashback: () => null, notes: ['Borrower-side rate per secondary source.'] },
  STRIVE: { camp: 'contract', confidence: 'estimate-only', label: 'Strive', compute: contractSimple({ flags: ['do-not-quote', 'fallback-only'] }), cashback: () => null, notes: ['Rough estimate only — confirm the exact figure with a payout statement.'] },
  EQB_EVOLUTION: { camp: 'contract', confidence: 'high', label: 'Equitable Bank — Evolution Suite', compute: contractSimple({ addDiscountToBorrower: true }), cashback: () => null, notes: ['Adds original discount back to the borrower-side rate.'] },
  EQB_STANDARD: {
    camp: 'goc-yield', confidence: 'high', label: 'Equitable Bank — Standard',
    compute: (i) => ({ ird: simpleIRD(i.balance, i.contractRate, i.currentRate ?? 0, i.monthsRemaining), threeMo: threeMonthInterest(i.balance, i.contractRate), method: 'simple', comparisonRate: i.currentRate ?? 0, flags: ['goc-yield-comparison'] }),
    cashback: () => null,
    variableMonths: (i) => { const yr = Math.ceil((i.monthsElapsed || 0) / 12); if (yr <= 1) return 5; if (yr === 2) return 4; return 3; },
    notes: ['Standard product benchmarks against Government of Canada yields, not lender rates.'],
  },
};

const ALIASES: Record<string, string> = {
  SCOTIABANK: 'SCOTIA',
  'NATIONAL BANK': 'NBC',
  NATIONAL_BANK: 'NBC',
  FIRSTNATIONAL: 'FIRST_NATIONAL',
  LENDWISE: 'MERIX',
  EQUITABLE_STANDARD: 'EQB_STANDARD',
  EQUITABLE_EVOLUTION: 'EQB_EVOLUTION',
  MANULIFE_BANK: 'MANULIFE',
};

function normalizeLender(name: string) {
  const key = String(name || '').toUpperCase().replace(/[\s.-]+/g, '_');
  return ALIASES[key] || ALIASES[key.replace(/_/g, ' ')] || key;
}

export function calculatePenalty(input: PenaltyInput): PenaltyResult {
  const name = normalizeLender(input.lender);
  const lender = LENDERS[name];
  const i: PenaltyInput = { discount: 0, cashback: 0, rateType: 'fixed', ...input };

  if (i.rateType === 'variable') {
    const months = lender?.variableMonths ? lender.variableMonths(i) : 3;
    const penalty = ((i.balance * i.contractRate) / 12) * months;
    return finalize(name, lender, {
      penalty: round2(penalty), ird: 0, threeMonthInterest: round2(penalty),
      method: `${months}-month-interest`, comparisonRate: null, camp: lender?.camp ?? 'generic',
      binding: '3-month-interest', cashbackClawback: lender ? nz(lender.cashback(i)) : null,
      flags: months !== 3 ? ['nonstandard-variable-months'] : [],
      confidence: lender?.confidence ?? 'generic-fallback',
      notes: lender?.notes ?? ['Unknown lender — generic 3-month-interest assumption.'],
    });
  }

  let r: Computed;
  if (lender) {
    r = lender.compute(i);
  } else {
    r = { ird: simpleIRD(i.balance, i.contractRate, i.currentRate ?? 0, i.monthsRemaining), threeMo: threeMonthInterest(i.balance, i.contractRate), method: 'simple', comparisonRate: i.currentRate ?? 0, flags: ['generic-fallback'] };
  }

  const ird = round2(r.ird);
  const threeMo = round2(r.threeMo);
  const penalty = Math.max(ird, threeMo);
  return finalize(name, lender, {
    penalty: round2(penalty), ird, threeMonthInterest: threeMo, method: r.method,
    comparisonRate: r.comparisonRate != null ? roundRate(r.comparisonRate) : null,
    addOn: r.addOn != null ? round2(r.addOn) : undefined,
    camp: lender?.camp ?? 'generic',
    binding: penalty === ird ? 'IRD' : 'three-month-interest',
    cashbackClawback: lender ? nz(lender.cashback(i)) : null,
    flags: r.flags || [], confidence: lender?.confidence ?? 'generic-fallback',
    notes: lender?.notes ?? ['Unknown lender — generic approximation; understates posted-rate lenders.'],
  });
}

const nz = (v: number | null) => (v == null ? null : round2(v));

function finalize(
  name: string,
  _lender: LenderDef | undefined,
  out: Omit<PenaltyResult, 'lender' | 'upperBound' | 'doNotQuote'>,
): PenaltyResult {
  return {
    lender: name,
    ...out,
    upperBound: (out.flags || []).includes('upper-bound-pv'),
    doNotQuote: (out.flags || []).includes('do-not-quote'),
  };
}

// ---------------------------------------------------------------------------
// Comparison-rate data. LIVE values come from public.ird_reference_rates on the
// Flow brain, refreshed daily by the ird-rates-refresh function straight from
// each bank's own rate feed and BoC Valet; callers load them with
// applyReferenceRates(). The literals below are only the fallback when that
// read fails, hand-verified against each bank's site on 2026-10-06. The July
// table they replace had gone a quarter stale, and its TD and BMO 2yr cells
// had been wrong from the start.
// ---------------------------------------------------------------------------
export const POSTED_TABLE: Record<string, Record<number, number>> = {
  RBC: { 1: 0.0574, 2: 0.0574, 3: 0.0625, 4: 0.0609, 5: 0.0619 },
  TD: { 1: 0.0549, 2: 0.0529, 3: 0.0605, 4: 0.0599, 5: 0.0609 },
  SCOTIA: { 1: 0.0549, 2: 0.0514, 3: 0.0605, 4: 0.0609, 5: 0.0619 },
  BMO: { 1: 0.0549, 2: 0.0494, 3: 0.0605, 4: 0.0599, 5: 0.0609 },
  CIBC: { 1: 0.0499, 2: 0.0524, 3: 0.0614, 4: 0.0619, 5: 0.0649 },
  NBC: { 1: 0.0549, 2: 0.0524, 3: 0.0605, 4: 0.0605, 5: 0.0614 },
};

export const GOC_YIELDS = { tbill_1y: 0.029, bond_2y: 0.0326, bond_3y: 0.0337, bond_5y: 0.0363 };
export let RATES_AS_OF = '2026-10-06';

export interface ReferenceRateRow {
  source: string;
  term: string;
  rate: number | string;
  fetched_at: string;
}

/**
 * Load rows from public.ird_reference_rates into POSTED_TABLE and GOC_YIELDS.
 * Only complete, in-band values are taken; anything else keeps its fallback.
 * Returns the date of the oldest row applied, which becomes RATES_AS_OF, or
 * null when nothing usable came back.
 */
export function applyReferenceRates(rows: ReferenceRateRow[]): string | null {
  let oldest: string | null = null;
  for (const row of rows) {
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0.002 || rate >= 0.2) continue;
    if (row.source === 'GOC') {
      if (!(row.term in GOC_YIELDS)) continue;
      (GOC_YIELDS as Record<string, number>)[row.term] = rate;
    } else if (POSTED_TABLE[row.source]) {
      const term = Number(row.term);
      if (!(term >= 1 && term <= 5)) continue;
      POSTED_TABLE[row.source][term] = rate;
    } else {
      continue;
    }
    const day = String(row.fetched_at).slice(0, 10);
    if (!oldest || day < oldest) oldest = day;
  }
  if (oldest) RATES_AS_OF = oldest;
  return oldest;
}

// Current offered rate default for contract-camp lenders (editable in the UI).
export const CONTRACT_MARKET_DEFAULT = 0.0479;

function termYearsFromMonths(months: number) {
  return Math.min(5, Math.max(1, Math.round(months / 12)));
}

// Derive a sensible comparison-side rate for a lender + remaining term, so the
// consumer UI doesn't have to know posted vs GoC vs offered. Returns the rate
// and a short label for display. The UI exposes this as an editable "advanced"
// field so brokers can paste the exact payout-desk rate.
export function deriveComparisonRate(lender: string, monthsRemaining: number): { rate: number; source: string } {
  const name = normalizeLender(lender);
  const def = LENDERS[name];
  if (!def) return { rate: CONTRACT_MARKET_DEFAULT, source: 'current market estimate' };
  if (def.camp === 'goc-yield') {
    if (monthsRemaining <= 24) return { rate: GOC_YIELDS.tbill_1y, source: `GoC 1yr T-bill (${RATES_AS_OF})` };
    if (monthsRemaining <= 36) return { rate: GOC_YIELDS.bond_2y, source: `GoC 2yr bond (${RATES_AS_OF})` };
    if (monthsRemaining <= 60) return { rate: GOC_YIELDS.bond_3y, source: `GoC 3yr bond (${RATES_AS_OF})` };
    return { rate: GOC_YIELDS.bond_5y, source: `GoC 5yr bond (${RATES_AS_OF})` };
  }
  if (def.camp === 'posted' || def.camp === 'posted-no-discount' || def.camp === 'posted-interpolated') {
    const row = POSTED_TABLE[name];
    const yr = termYearsFromMonths(monthsRemaining);
    if (row && row[yr] != null) return { rate: row[yr], source: `${def.label} posted ${yr}yr (${RATES_AS_OF})` };
  }
  return { rate: CONTRACT_MARKET_DEFAULT, source: `current ${def.label} rate estimate` };
}

export const LENDER_OPTIONS: { value: string; label: string; camp: Camp }[] = Object.entries(LENDERS)
  .map(([value, d]) => ({ value, label: d.label, camp: d.camp }))
  .sort((a, b) => a.label.localeCompare(b.label));
