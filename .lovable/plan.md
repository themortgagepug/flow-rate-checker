
# Fix Savings Calculations and Add Dual Scenario Results

## The Problem

The current savings calculation uses a simplified formula: `(rateDifference / 100) * balance`. This just computes the raw annual interest differential and doesn't reflect actual payment differences based on amortization schedules. That's why every user sees similar "savings" numbers regardless of their specific situation.

Additionally, the results page doesn't account for real switching costs (legal fees, appraisal, discharge fees) beyond the penalty, and it only shows one generic number instead of helping users understand their actual options.

## The Solution

Rework the calculation engine and results page to show **two clear scenarios**:

### Scenario A: "Break and go fresh (30-year amortization)"
- New mortgage at the comparable rate with a fresh 30-year (360-month) amortization
- Shows: new payment amount, payment savings per month, total interest cost difference over the new term, net savings after penalty + fees

### Scenario B: "Match your current amortization"
- New mortgage at the comparable rate but keeping the same remaining amortization period
- Shows: new payment amount, payment savings per month, total interest savings over remaining term, net savings after penalty + fees

### Switching Costs
- Include estimated legal/closing fees (~$1,000 default) and discharge fee (~$300) alongside the penalty
- Show total cost to switch clearly

---

## Technical Changes

### 1. Update `src/types/index.ts`
Add new fields to `QuizResult`:
- `switchingCosts` (penalty + legal + discharge fees)
- `scenarioFresh` object: `{ newPayment, paymentSavings, totalInterestSaved, netSavings, amortMonths: 360 }`
- `scenarioMatch` object: `{ newPayment, paymentSavings, totalInterestSaved, netSavings, amortMonths }`

### 2. Update `src/lib/calculations.ts`
- Add a `calculateTotalInterest(balance, annualRate, amortMonths)` function that sums all interest paid over the life of the loan
- Add a `computeScenario(balance, currentRate, currentAmortMonths, newRate, newAmortMonths, frequency)` function that returns payment difference and total interest savings
- Update `computeResults()` to:
  - Calculate **Scenario A**: fresh 30-year amort at comparable rate vs current payment
  - Calculate **Scenario B**: same remaining amort at comparable rate vs current payment
  - Compute `switchingCosts = penalty + 1000 (legal) + 300 (discharge)`
  - Net savings = interest savings - switching costs for each scenario
  - Fix `yearlySavings` and `monthlySavings` to use actual payment differences (Scenario B by default)

### 3. Update `src/components/results/ResultsPage.tsx`
Replace the single "yearly savings" display with a **tabbed or toggle view** showing both scenarios:

**Layout:**
- Rate comparison cards (keep as-is)
- Switching costs section: penalty + legal + discharge = total
- **Scenario A card** ("Start fresh — 30 years"): new payment, monthly savings, total interest saved, net benefit
- **Scenario B card** ("Keep your timeline"): new payment, monthly savings, total interest saved, net benefit
- A clear recommendation based on which scenario has better net savings
- Keep the existing CTA section below

### 4. No database or backend changes needed
All calculations are client-side. The penalty estimate from the edge function is still used as-is.
