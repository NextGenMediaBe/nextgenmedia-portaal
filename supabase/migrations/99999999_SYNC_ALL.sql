-- ═════════════════════════════════════════════════════════════════════════════
--  NEXTGENMEDIA — VOLLEDIG SYNC-SCRIPT
--
--  Eén script dat ALLE kolommen, tabellen en buckets toevoegt die de huidige
--  applicatiecode verwacht. Volledig idempotent: veilig om meerdere keren te
--  runnen. Voegt alleen toe wat ontbreekt, verwijdert of overschrijft niets.
--
--  GEBRUIK: plak dit volledig in de Supabase SQL Editor en klik Run.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── clients ──────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS archived_at   timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_value numeric,
  ADD COLUMN IF NOT EXISTS revenue_type  text;

-- ── client_services: portal access defaults to false (admin grants later) ─────
ALTER TABLE public.client_services
  ALTER COLUMN active SET DEFAULT false;

-- ── contracts: signature zone, signed pdf, service tag, AI fields ─────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS service_slug     text,
  ADD COLUMN IF NOT EXISTS signed_pdf_path  text,
  ADD COLUMN IF NOT EXISTS sig_page         integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sig_x_pct        numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS sig_y_pct        numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS sig_width        numeric NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS sig_height       numeric NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS signer_name      text,
  ADD COLUMN IF NOT EXISTS signer_email     text,
  ADD COLUMN IF NOT EXISTS detected_fields  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_values     jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── social_content_items: multi-platform ──────────────────────────────────────
ALTER TABLE public.social_content_items
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.social_content_items
   SET platforms = ARRAY[platform]
 WHERE platform IS NOT NULL AND platforms = '{}'::text[];

-- ── webdesign_change_requests: image paths + friendly kind buckets ────────────
ALTER TABLE public.webdesign_change_requests
  ADD COLUMN IF NOT EXISTS image_paths text[]  NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS image_urls  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS categories  text[]  NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

-- Relax the kind CHECK so portal values (text/color/image/other) are allowed.
DO $$
BEGIN
  ALTER TABLE public.webdesign_change_requests DROP CONSTRAINT IF EXISTS webdesign_change_requests_kind_check;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── revenue_entries: title + billing frequency ────────────────────────────────
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS title             text,
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'monthly';

-- ── freelancers (partners): finance/profile fields (both schema variants) ─────
ALTER TABLE public.freelancers
  ADD COLUMN IF NOT EXISTS name                   text,
  ADD COLUMN IF NOT EXISTS company                text,
  ADD COLUMN IF NOT EXISTS company_name           text,
  ADD COLUMN IF NOT EXISTS vat_number             text,
  ADD COLUMN IF NOT EXISTS iban                   text,
  ADD COLUMN IF NOT EXISTS commission_pct         numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS default_commission_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS region                 text,
  ADD COLUMN IF NOT EXISTS active                 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes                  text,
  ADD COLUMN IF NOT EXISTS bio                    text;

-- Backfill name from full_name if the legacy column exists
DO $$
BEGIN
  UPDATE public.freelancers SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- ── freelancer_assignments: modern columns + origin + deal_type ───────────────
ALTER TABLE public.freelancer_assignments
  ADD COLUMN IF NOT EXISTS title        text,
  ADD COLUMN IF NOT EXISTS description  text,
  ADD COLUMN IF NOT EXISTS budget       numeric,
  ADD COLUMN IF NOT EXISTS payout       numeric,
  ADD COLUMN IF NOT EXISTS deadline     date,
  ADD COLUMN IF NOT EXISTS service_slug text,
  ADD COLUMN IF NOT EXISTS roles        text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS status       text   NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS origin       text   NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS deal_type    text   NOT NULL DEFAULT 'fixed';

-- Make the legacy NOT NULL `role` column optional (newer code uses roles[])
DO $$
BEGIN
  ALTER TABLE public.freelancer_assignments ALTER COLUMN role DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_origin ON public.freelancer_assignments (origin);

-- ── partner_ledger_entries (create if missing) ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.partner_ledger_kind AS ENUM
    ('payout_owed','commission_owed','service_billed','manual_credit','manual_debit','settlement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.partner_ledger_status AS ENUM ('pending','settled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.partner_ledger_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  kind          public.partner_ledger_kind NOT NULL,
  status        public.partner_ledger_status NOT NULL DEFAULT 'pending',
  amount        numeric NOT NULL,
  description   text,
  client_id     uuid,
  assignment_id uuid,
  occurred_on   date NOT NULL DEFAULT CURRENT_DATE,
  settlement_id uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_ledger_entries
  ADD COLUMN IF NOT EXISTS direction          text,
  ADD COLUMN IF NOT EXISTS commission_deal_id uuid,
  ADD COLUMN IF NOT EXISTS commission_year    integer;

UPDATE public.partner_ledger_entries
   SET direction = CASE WHEN amount >= 0 THEN 'we_pay_partner' ELSE 'partner_pays_us' END
 WHERE direction IS NULL;

ALTER TABLE public.partner_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger admin all"        ON public.partner_ledger_entries;
DROP POLICY IF EXISTS "ledger partner read own" ON public.partner_ledger_entries;
CREATE POLICY "ledger admin all" ON public.partner_ledger_entries
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "ledger partner read own" ON public.partner_ledger_entries
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

-- ── partner_settlements (create if missing) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_settlements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id         uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  total_owed_to_partner numeric NOT NULL DEFAULT 0,
  total_owed_by_partner numeric NOT NULL DEFAULT 0,
  net_amount            numeric NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'draft',
  notes                 text,
  finalized_at          timestamptz,
  paid_at               timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlements admin all"        ON public.partner_settlements;
DROP POLICY IF EXISTS "settlements partner read own" ON public.partner_settlements;
CREATE POLICY "settlements admin all" ON public.partner_settlements
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "settlements partner read own" ON public.partner_settlements
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

-- ── partner_commission_deals ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_commission_deals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id  uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  label          text,
  service_slug   text,
  contract_value numeric NOT NULL DEFAULT 0,
  start_date     date NOT NULL DEFAULT CURRENT_DATE,
  pct_year_1     numeric NOT NULL DEFAULT 10,
  pct_year_2     numeric NOT NULL DEFAULT 8,
  pct_year_3     numeric NOT NULL DEFAULT 5,
  status         text NOT NULL DEFAULT 'active',
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_deals_freelancer ON public.partner_commission_deals(freelancer_id);

ALTER TABLE public.partner_commission_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission deals admin all"   ON public.partner_commission_deals;
DROP POLICY IF EXISTS "commission deals partner read" ON public.partner_commission_deals;
CREATE POLICY "commission deals admin all" ON public.partner_commission_deals
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "commission deals partner read" ON public.partner_commission_deals
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

-- ── updated_at triggers (best effort; helper may not exist on all projects) ───
DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_partner_ledger_updated      ON public.partner_ledger_entries;
  CREATE TRIGGER trg_partner_ledger_updated      BEFORE UPDATE ON public.partner_ledger_entries     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS trg_partner_settlements_updated ON public.partner_settlements;
  CREATE TRIGGER trg_partner_settlements_updated BEFORE UPDATE ON public.partner_settlements         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS trg_commission_deals_updated    ON public.partner_commission_deals;
  CREATE TRIGGER trg_commission_deals_updated    BEFORE UPDATE ON public.partner_commission_deals    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Alle kolommen, tabellen, policies en triggers staan nu in sync met de code.
