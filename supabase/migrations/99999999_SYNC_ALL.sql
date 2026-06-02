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
  ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_value  numeric,
  ADD COLUMN IF NOT EXISTS revenue_type   text,
  -- Sinds wanneer is dit een klant bij ons (kan vroeger zijn dan created_at).
  -- Bepaalt het commissiejaar (10/8/5%) voor aangeleverde commissiedeals.
  ADD COLUMN IF NOT EXISTS customer_since date,
  -- Laatst door admin ingestelde login-wachtwoord (klaartekst, admin-only).
  -- Alleen gevuld als admin het wachtwoord zelf instelt/reset.
  ADD COLUMN IF NOT EXISTS login_password text;

-- Backfill customer_since from created_at where empty
UPDATE public.clients SET customer_since = created_at::date WHERE customer_since IS NULL;

-- ── freelancers: store the admin-set login password (admin-only) ──────────────
ALTER TABLE public.freelancers
  ADD COLUMN IF NOT EXISTS login_password text;

-- ── contracts: looptijd voor reeds-getekende uploads ─────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date   date;

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

-- ── partner_commission_deals: referral now works without an upfront value ─────
-- A commission deal = a REFERRAL relationship (partner + client + referred_at +
-- the 3 yearly %s). Individual sales live in partner_commission_sales below, so
-- contract_value is no longer required.
DO $$
BEGIN
  ALTER TABLE public.partner_commission_deals ALTER COLUMN contract_value DROP NOT NULL;
  ALTER TABLE public.partner_commission_deals ALTER COLUMN contract_value SET DEFAULT 0;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- Commissie-RICHTING van een doorverwijzing:
--   'we_pay_partner'  = partner verwees klant NAAR ons  → WIJ betalen partner   (scenario 1)
--   'partner_pays_us' = WIJ verwezen klant naar partner → PARTNER betaalt ons   (scenario 2)
-- Onderaanneming (vast bedrag) loopt NIET via deze tabel en levert nooit commissie op.
ALTER TABLE public.partner_commission_deals
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'we_pay_partner';

-- ── partner_commission_sales: one row per sale to a referred client ───────────
-- Each sale earns commission at the rate of the referral year it falls in.
CREATE TABLE IF NOT EXISTS public.partner_commission_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES public.partner_commission_deals(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  service_slug  text,
  description   text,
  sale_amount   numeric NOT NULL,
  sale_date     date NOT NULL DEFAULT CURRENT_DATE,
  commission_year integer NOT NULL,
  commission_pct  numeric NOT NULL,
  commission_amount numeric NOT NULL,
  ledger_id     uuid,          -- the generated partner_ledger_entries row
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_sales_deal ON public.partner_commission_sales(deal_id);
CREATE INDEX IF NOT EXISTS idx_commission_sales_freelancer ON public.partner_commission_sales(freelancer_id);

ALTER TABLE public.partner_commission_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commission sales admin all"    ON public.partner_commission_sales;
DROP POLICY IF EXISTS "commission sales partner read" ON public.partner_commission_sales;
CREATE POLICY "commission sales admin all" ON public.partner_commission_sales
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "commission sales partner read" ON public.partner_commission_sales
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

-- ── audit_log: onveranderlijk logboek van gevoelige acties (GDPR/security) ─────
-- Puur additief. Schrijven gebeurt met de service-role (bypasst RLS); admins
-- mogen lezen. Niemand mag via de client wijzigen of verwijderen → append-only.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,                 -- wie voerde de actie uit (auth.users.id)
  actor_email   text,
  actor_role    text,
  action        text NOT NULL,        -- bv. 'client.credentials.update'
  entity_type   text,                 -- bv. 'client', 'partner', 'settlement'
  entity_id     text,
  summary       text,                 -- korte, menselijke omschrijving
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- nooit wachtwoorden/secrets
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created   ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity    ON public.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor     ON public.audit_log (actor_user_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Admins mogen het logboek lezen. Schrijven loopt uitsluitend via de service-role
-- (die RLS overslaat), dus er is bewust GEEN insert/update/delete policy → het
-- log is niet te manipuleren vanuit een gewone (admin- of klant-)sessie.
DROP POLICY IF EXISTS "audit_log admin read" ON public.audit_log;
CREATE POLICY "audit_log admin read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── ClickUp-sync (app → ClickUp, één richting) ────────────────────────────────
-- Puur additief. Per klant aan/uit schakelbaar + opgeslagen folder/list-id zodat
-- we niet telkens opnieuw zoeken. Per contentitem het ClickUp task-id + een hash
-- van de gesyncte velden (om onnodige API-calls over te slaan).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS clickup_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clickup_folder_id    text,
  ADD COLUMN IF NOT EXISTS clickup_list_id      text;

ALTER TABLE public.social_content_items
  ADD COLUMN IF NOT EXISTS clickup_task_id    text,
  ADD COLUMN IF NOT EXISTS clickup_sync_hash  text,
  ADD COLUMN IF NOT EXISTS clickup_synced_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_social_items_clickup_task ON public.social_content_items (clickup_task_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Alle kolommen, tabellen, policies en triggers staan nu in sync met de code.
