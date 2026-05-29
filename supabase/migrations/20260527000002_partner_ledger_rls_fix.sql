-- ─── partner_ledger_entries ───────────────────────────────────────────────────
-- Create enum types if not exists
DO $$ BEGIN
  CREATE TYPE public.partner_ledger_kind AS ENUM (
    'payout_owed',
    'commission_owed',
    'service_billed',
    'manual_credit',
    'manual_debit',
    'settlement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_ledger_status AS ENUM ('pending', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create table (idempotent)
CREATE TABLE IF NOT EXISTS public.partner_ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id   uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  kind            public.partner_ledger_kind NOT NULL,
  status          public.partner_ledger_status NOT NULL DEFAULT 'pending',
  amount          numeric NOT NULL,
  description     text,
  client_id       uuid,
  assignment_id   uuid,
  occurred_on     date NOT NULL DEFAULT CURRENT_DATE,
  settlement_id   uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_ledger_freelancer  ON public.partner_ledger_entries(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_partner_ledger_status      ON public.partner_ledger_entries(status);
CREATE INDEX IF NOT EXISTS idx_partner_ledger_settlement  ON public.partner_ledger_entries(settlement_id);

ALTER TABLE public.partner_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Drop old (broken) policies, recreate with correct pattern
DROP POLICY IF EXISTS "ledger admin all"       ON public.partner_ledger_entries;
DROP POLICY IF EXISTS "ledger partner read own" ON public.partner_ledger_entries;

CREATE POLICY "ledger admin all" ON public.partner_ledger_entries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "ledger partner read own" ON public.partner_ledger_entries
  FOR SELECT TO authenticated
  USING (freelancer_id IN (
    SELECT id FROM public.freelancers WHERE user_id = auth.uid()
  ));

-- Trigger for updated_at (idempotent via DROP IF EXISTS)
DROP TRIGGER IF EXISTS trg_partner_ledger_updated ON public.partner_ledger_entries;
CREATE TRIGGER trg_partner_ledger_updated
  BEFORE UPDATE ON public.partner_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── partner_settlements ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_settlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id        uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  period_start         date NOT NULL,
  period_end           date NOT NULL,
  total_owed_to_partner  numeric NOT NULL DEFAULT 0,
  total_owed_by_partner  numeric NOT NULL DEFAULT 0,
  net_amount           numeric NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'draft',  -- draft | finalized | paid
  notes                text,
  finalized_at         timestamptz,
  paid_at              timestamptz,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_settlements_freelancer ON public.partner_settlements(freelancer_id);

ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlements admin all"       ON public.partner_settlements;
DROP POLICY IF EXISTS "settlements partner read own" ON public.partner_settlements;

CREATE POLICY "settlements admin all" ON public.partner_settlements
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "settlements partner read own" ON public.partner_settlements
  FOR SELECT TO authenticated
  USING (freelancer_id IN (
    SELECT id FROM public.freelancers WHERE user_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS trg_partner_settlements_updated ON public.partner_settlements;
CREATE TRIGGER trg_partner_settlements_updated
  BEFORE UPDATE ON public.partner_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── revenue_entries: add title + billing_frequency ──────────────────────────
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS title             text,
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'monthly';
