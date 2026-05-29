
-- Extend freelancers (partners) with finance/profile fields
ALTER TABLE public.freelancers
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS default_commission_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

-- Ledger entry types
DO $$ BEGIN
  CREATE TYPE public.partner_ledger_kind AS ENUM (
    'payout_owed',     -- we owe partner (e.g. project delivery)
    'commission_owed', -- we owe partner (referral commission)
    'service_billed',  -- partner owes us (we delivered service to them)
    'manual_credit',   -- generic credit to partner
    'manual_debit',    -- generic debit from partner
    'settlement'       -- closing entry from a settlement
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_ledger_status AS ENUM ('pending', 'settled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ledger entries: positive amount = we owe partner, negative = partner owes us
CREATE TABLE IF NOT EXISTS public.partner_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  kind public.partner_ledger_kind NOT NULL,
  status public.partner_ledger_status NOT NULL DEFAULT 'pending',
  amount numeric NOT NULL, -- positive = owed to partner, negative = partner owes us
  description text,
  client_id uuid,
  assignment_id uuid,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  settlement_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_ledger_freelancer ON public.partner_ledger_entries(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_partner_ledger_status ON public.partner_ledger_entries(status);
CREATE INDEX IF NOT EXISTS idx_partner_ledger_settlement ON public.partner_ledger_entries(settlement_id);

ALTER TABLE public.partner_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger admin all" ON public.partner_ledger_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ledger partner read own" ON public.partner_ledger_entries
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_partner_ledger_updated
BEFORE UPDATE ON public.partner_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Settlements: monthly closure
CREATE TABLE IF NOT EXISTS public.partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_owed_to_partner numeric NOT NULL DEFAULT 0,
  total_owed_by_partner numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0, -- positive = pay partner, negative = collect from partner
  status text NOT NULL DEFAULT 'draft', -- draft | finalized | paid
  notes text,
  finalized_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_settlements_freelancer ON public.partner_settlements(freelancer_id);

ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements admin all" ON public.partner_settlements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "settlements partner read own" ON public.partner_settlements
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_partner_settlements_updated
BEFORE UPDATE ON public.partner_settlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
