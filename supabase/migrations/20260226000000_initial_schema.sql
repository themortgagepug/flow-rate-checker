-- Rate App (rate.getflowmortgage.ca) Schema Snapshot
-- Source: src/integrations/supabase/types.ts (Lovable-generated, mirrors live DB)
-- Captured: 2026-05-04
-- Lovable project: 62c19ea2-e711-4f60-9b59-6f397b40cfd5
-- Supabase ref: dotglplhsdsmrbacmtrx (Lovable-managed)
-- Postgrest version: 14.1
-- Verify against live before applying to new Supabase: ask Lovable AI to run pg_dump --schema-only and diff

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  email text,
  name text,
  phone text,
  preferred_day text,
  preferred_time text,
  quiz_results jsonb
);

CREATE TABLE IF NOT EXISTS public.market_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric NOT NULL,
  rate_type text DEFAULT 'fixed',
  source text,
  term_key text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mortgage_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerts_requested boolean,
  balance numeric,
  breakeven_months integer,
  call_requested boolean,
  created_at timestamptz DEFAULT now(),
  email text,
  first_name text,
  grade integer,
  lender text,
  mortgage_type text,
  payment numeric,
  payment_frequency text,
  penalty_estimate numeric,
  rate numeric,
  rate_difference numeric,
  renewal_date date,
  report_requested boolean,
  term integer,
  yearly_savings numeric
);

CREATE TABLE IF NOT EXISTS public.result_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES public.mortgage_submissions(id),
  viewed_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS POLICIES (from supabase/migrations/20260227192615_*.sql)
-- ============================================================

ALTER TABLE public.mortgage_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public reads on mortgage_submissions"
  ON public.mortgage_submissions FOR SELECT USING (false);

CREATE POLICY "No public reads on callback_requests"
  ON public.callback_requests FOR SELECT USING (false);

CREATE POLICY "No public reads on result_views"
  ON public.result_views FOR SELECT USING (false);

-- Edge functions use SERVICE_ROLE_KEY which bypasses RLS for inserts.
-- market_rates has no RLS shown in repo migrations — likely public read for the scrape-rates function.

-- ============================================================
-- VERIFICATION CHECKLIST (before applying to new Supabase)
-- ============================================================
-- [ ] Confirm column types via pg_dump --schema-only on live (some types inferred from TS)
-- [ ] Confirm DEFAULT values (TS doesn't show DB-level defaults)
-- [ ] Confirm PRIMARY KEY column (assumed `id` for all tables)
-- [ ] Capture any indexes (TS doesn't show indexes)
-- [ ] Capture market_rates RLS policy (not in repo migrations, may be permissive)
-- [ ] Confirm any triggers (TS doesn't show triggers)
-- [ ] Confirm any extensions used (likely uuid-ossp or pgcrypto for gen_random_uuid)
