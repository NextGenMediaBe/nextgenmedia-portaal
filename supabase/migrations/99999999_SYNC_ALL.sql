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

-- ── shoot_briefings: contentshoot-info per klant (admin beheert, klant leest) ──
-- Puur additief. Eén of meerdere shoots per klant met datum/uur/locatie + een
-- vrij briefing-tekstveld. Geen workflow/statussen.
CREATE TABLE IF NOT EXISTS public.shoot_briefings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  shoot_date  date,
  start_time  text,
  end_time    text,
  location    text,
  briefing    text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shoot_briefings_client ON public.shoot_briefings(client_id);

ALTER TABLE public.shoot_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shoot admin all"        ON public.shoot_briefings;
DROP POLICY IF EXISTS "shoot client read own"  ON public.shoot_briefings;
CREATE POLICY "shoot admin all" ON public.shoot_briefings
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "shoot client read own" ON public.shoot_briefings
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_shoot_briefings_updated ON public.shoot_briefings;
  CREATE TRIGGER trg_shoot_briefings_updated BEFORE UPDATE ON public.shoot_briefings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── shoot_briefing_feedback: eenvoudige feedback/comments onder een briefing ──
-- Klant plaatst feedback (via server na eigendomscheck); admin markeert verwerkt.
CREATE TABLE IF NOT EXISTS public.shoot_briefing_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id    uuid NOT NULL REFERENCES public.shoot_briefings(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_role text NOT NULL DEFAULT 'client',  -- 'client' | 'admin'
  message     text NOT NULL,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shoot_feedback_shoot ON public.shoot_briefing_feedback(shoot_id);

ALTER TABLE public.shoot_briefing_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shoot fb admin all"       ON public.shoot_briefing_feedback;
DROP POLICY IF EXISTS "shoot fb client read own" ON public.shoot_briefing_feedback;
CREATE POLICY "shoot fb admin all" ON public.shoot_briefing_feedback
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "shoot fb client read own" ON public.shoot_briefing_feedback
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

-- ── month_planning_overrides: handmatige uitzonderingen op de maandplanning ────
-- Interne NextGenMedia-planning. Standaard blijft automatisch (op werkdagen);
-- per datum kan admin de fases overschrijven (verslepen / aanpassen). Een lege
-- array betekent 'deze dag bewust leeg'. Geen rij = standaardberekening.
CREATE TABLE IF NOT EXISTS public.month_planning_overrides (
  plan_date   date PRIMARY KEY,
  categories  text[] NOT NULL DEFAULT '{}'::text[],
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.month_planning_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "month plan admin all" ON public.month_planning_overrides;
CREATE POLICY "month plan admin all" ON public.month_planning_overrides
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── cost_entries: kosten (eenmalig + recurring) voor het financieel dashboard ─
-- Bedragen excl. btw + btw%; incl. wordt berekend. Admin-only.
CREATE TABLE IF NOT EXISTS public.cost_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text,
  category          text,
  type              text NOT NULL DEFAULT 'one_time',   -- 'one_time' | 'recurring'
  cost_date         date,                                -- eenmalig
  start_date        date,                                -- recurring
  end_date          date,                                -- recurring (optioneel)
  billing_frequency text NOT NULL DEFAULT 'monthly',     -- monthly | quarterly | annual
  amount_excl       numeric NOT NULL DEFAULT 0,
  vat_pct           numeric NOT NULL DEFAULT 21,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_type ON public.cost_entries(type);

ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "costs admin all" ON public.cost_entries;
CREATE POLICY "costs admin all" ON public.cost_entries
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_cost_entries_updated ON public.cost_entries;
  CREATE TRIGGER trg_cost_entries_updated BEFORE UPDATE ON public.cost_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── fiscal_settings: instelbare fiscale parameters + loon per boekjaar ────────
-- Geen hardcoded percentages in de code: deze waarden zijn admin-instelbaar en
-- wijzigen jaarlijks. Eén rij per boekjaar.
CREATE TABLE IF NOT EXISTS public.fiscal_settings (
  year                   integer PRIMARY KEY,
  corporate_tax_pct      numeric NOT NULL DEFAULT 25,
  reduced_tax_pct        numeric NOT NULL DEFAULT 20,
  reduced_tax_limit      numeric NOT NULL DEFAULT 100000,
  social_pct_band1       numeric NOT NULL DEFAULT 20.5,
  social_pct_band2       numeric NOT NULL DEFAULT 14.16,
  income_band1_limit     numeric NOT NULL DEFAULT 75000,
  income_band2_limit     numeric NOT NULL DEFAULT 115000,
  mgmt_fee_pct           numeric NOT NULL DEFAULT 3.05,
  min_quarter            numeric NOT NULL DEFAULT 870,
  max_quarter            numeric NOT NULL DEFAULT 5000,
  extra_pct              numeric NOT NULL DEFAULT 0,
  extra_fixed            numeric NOT NULL DEFAULT 0,
  salary_gross_monthly   numeric NOT NULL DEFAULT 0,
  salary_months          integer NOT NULL DEFAULT 12,
  statuut                text NOT NULL DEFAULT 'zaakvoerder',
  include_social_as_cost boolean NOT NULL DEFAULT false,
  updated_by             uuid,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Dashboard 3.0: BTW%, cash-reserve%, cash op rekening, opnames vennoten
ALTER TABLE public.fiscal_settings
  ADD COLUMN IF NOT EXISTS vat_pct          numeric NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS cash_reserve_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS cash_on_account  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_draws    numeric NOT NULL DEFAULT 0;

ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal admin all" ON public.fiscal_settings;
CREATE POLICY "fiscal admin all" ON public.fiscal_settings
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── vesting (Vestiging-module): config + omzetregistraties ────────────────────
-- Puur informatief dashboard van het vestigingsprincipe; wijzigt geen echte
-- aandelen. Admin-only. Eén configrij (id=1) met de instelbare schijf-parameters.
CREATE TABLE IF NOT EXISTS public.vesting_config (
  id           integer PRIMARY KEY DEFAULT 1,
  start_date   date,
  schijf2_per  numeric NOT NULL DEFAULT 5000,
  schijf3_y1   numeric NOT NULL DEFAULT 10000,
  schijf3_y2   numeric NOT NULL DEFAULT 12000,
  schijf3_y3   numeric NOT NULL DEFAULT 15000,
  inbound_pct  numeric NOT NULL DEFAULT 30,
  website_pct  numeric NOT NULL DEFAULT 100,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vesting_revenue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name     text,
  service_slug    text,
  entry_date      date NOT NULL DEFAULT CURRENT_DATE,
  net_revenue     numeric NOT NULL DEFAULT 0,
  type            text NOT NULL DEFAULT 'inbound',  -- inbound | outbound | website
  attribution_pct numeric NOT NULL DEFAULT 0,
  vesting_revenue numeric NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Outbound = outreach (50%) + closing (50%); Inbound = closing (25%).
ALTER TABLE public.vesting_revenue
  ADD COLUMN IF NOT EXISTS outreach boolean,
  ADD COLUMN IF NOT EXISTS closing  boolean;

CREATE INDEX IF NOT EXISTS idx_vesting_revenue_date ON public.vesting_revenue(entry_date DESC);

ALTER TABLE public.vesting_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vesting_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vesting cfg admin all" ON public.vesting_config;
DROP POLICY IF EXISTS "vesting rev admin all" ON public.vesting_revenue;
CREATE POLICY "vesting cfg admin all" ON public.vesting_config
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "vesting rev admin all" ON public.vesting_revenue
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── purchases: aankoopaanvragen + goedkeuringen (>€1.000) ─────────────────────
CREATE TABLE IF NOT EXISTS public.purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text,
  description       text,
  amount_excl       numeric NOT NULL DEFAULT 0,
  vat_pct           numeric NOT NULL DEFAULT 21,
  supplier          text,
  category          text,
  requester_user_id uuid,
  requester_email   text,
  entry_date        date NOT NULL DEFAULT CURRENT_DATE,
  attachment_path   text,
  status            text NOT NULL DEFAULT 'pending',  -- concept|pending|approved|approved_under_threshold|rejected
  needs_approval    boolean NOT NULL DEFAULT true,
  cost_entry_id     uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);

CREATE TABLE IF NOT EXISTS public.purchase_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id       uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  approver_user_id  uuid,
  approver_email    text NOT NULL,
  decision          text NOT NULL,        -- approved | rejected
  comment           text,
  decided_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_id, approver_email)
);
CREATE INDEX IF NOT EXISTS idx_purchase_approvals_purchase ON public.purchase_approvals(purchase_id);

ALTER TABLE public.purchases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchases admin all"  ON public.purchases;
DROP POLICY IF EXISTS "purchase appr admin"  ON public.purchase_approvals;
CREATE POLICY "purchases admin all" ON public.purchases
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "purchase appr admin" ON public.purchase_approvals
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_purchases_updated ON public.purchases;
  CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── shoot_ideas: ideeën/inspiratie van de klant per shoot (geen scriptwijziging) ─
CREATE TABLE IF NOT EXISTS public.shoot_ideas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id        uuid NOT NULL REFERENCES public.shoot_briefings(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title           text,
  description     text,
  attachment_path text,
  status          text NOT NULL DEFAULT 'new',  -- new | seen | use | discard
  admin_note      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shoot_ideas_shoot ON public.shoot_ideas(shoot_id);

ALTER TABLE public.shoot_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shoot ideas admin all"       ON public.shoot_ideas;
DROP POLICY IF EXISTS "shoot ideas client read own" ON public.shoot_ideas;
CREATE POLICY "shoot ideas admin all" ON public.shoot_ideas
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "shoot ideas client read own" ON public.shoot_ideas
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

-- ── batches: productiebatches (naam/kleur/contentperiode) + klant-koppeling ────
CREATE TABLE IF NOT EXISTS public.batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL DEFAULT 'Batch',
  color        text NOT NULL DEFAULT '#3b82f6',
  start_month  integer NOT NULL DEFAULT 0,   -- ankermaand contentperiode (0-11)
  shoot_offset integer NOT NULL DEFAULT 1,   -- aantal maanden vóór content = shoot
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL;

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batches admin all" ON public.batches;
CREATE POLICY "batches admin all" ON public.batches
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_batches_updated ON public.batches;
  CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── month_planning_clients: klanten handmatig aan een fase/maand koppelen ─────
-- Maandplanning wordt klantgericht: per maand (YYYY-MM) koppelt de admin klanten
-- aan een fase, optioneel met een planning-type (onboarding / strategie) + notitie.
CREATE TABLE IF NOT EXISTS public.month_planning_clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_month    text NOT NULL,                 -- 'YYYY-MM'
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase         text NOT NULL,                 -- fase-slug (zie lib/month-phases)
  planning_type text,                          -- 'onboarding' | 'strategie' | 'standaard'
  note          text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_month_plan_clients_month ON public.month_planning_clients (plan_month);

ALTER TABLE public.month_planning_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "month plan clients admin all" ON public.month_planning_clients;
CREATE POLICY "month plan clients admin all" ON public.month_planning_clients
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_month_plan_clients_updated ON public.month_planning_clients;
  CREATE TRIGGER trg_month_plan_clients_updated BEFORE UPDATE ON public.month_planning_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── partner_payments: echte geldstromen (los van de verplichtingen-ledger) ─────
-- Een betaling vereffent (een deel van) het openstaande saldo. Wordt NOOIT
-- verwijderd; enkel status: pending → approved | cancelled. Zowel admin als
-- partner mogen registreren; partner-registraties starten als 'pending'.
CREATE TABLE IF NOT EXISTS public.partner_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id   uuid NOT NULL REFERENCES public.freelancers(id) ON DELETE CASCADE,
  direction       text NOT NULL,               -- 'we_pay_partner' | 'partner_pays_us'
  amount          numeric NOT NULL,
  paid_on         date NOT NULL DEFAULT CURRENT_DATE,
  note            text,
  proof_path      text,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'cancelled'
  created_by_role text,                         -- 'admin' | 'partner'
  created_by      uuid,
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_payments_freelancer ON public.partner_payments (freelancer_id);

ALTER TABLE public.partner_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner payments admin all"     ON public.partner_payments;
DROP POLICY IF EXISTS "partner payments partner read"  ON public.partner_payments;
DROP POLICY IF EXISTS "partner payments partner insert" ON public.partner_payments;
CREATE POLICY "partner payments admin all" ON public.partner_payments
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "partner payments partner read" ON public.partner_payments
  FOR SELECT TO authenticated
  USING (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));
CREATE POLICY "partner payments partner insert" ON public.partner_payments
  FOR INSERT TO authenticated
  WITH CHECK (freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()) AND status = 'pending');

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_partner_payments_updated ON public.partner_payments;
  CREATE TRIGGER trg_partner_payments_updated BEFORE UPDATE ON public.partner_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── E-mail Center: templates, verzendlog, meldingsstatus ──────────────────────
-- Mails gaan nooit automatisch naar klanten; enkel admins versturen bewust.
-- Admin-meldingen mogen wel automatisch (per uur, via cron).
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  subject     text NOT NULL DEFAULT '',
  body        text NOT NULL DEFAULT '',
  kind        text,                         -- optionele categorie: scripts/contract/shoot/generic
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email templates admin all" ON public.email_templates;
CREATE POLICY "email templates admin all" ON public.email_templates
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS public.email_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email      text NOT NULL,
  to_client_id  uuid,
  subject       text NOT NULL,
  body          text NOT NULL,
  template_id   uuid,
  template_name text,
  kind          text,                       -- scripts/contract/shoot/admin_notify/generic
  audience      text NOT NULL DEFAULT 'client',  -- 'client' | 'admin'
  status        text NOT NULL DEFAULT 'sent',    -- 'sent' | 'delivered' | 'error'
  error         text,
  provider_id   text,
  sent_by       uuid,
  sent_by_email text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_created ON public.email_messages (created_at DESC);
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email messages admin all" ON public.email_messages;
CREATE POLICY "email messages admin all" ON public.email_messages
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Singleton-rij die bijhoudt tot wanneer admins al gemeld zijn.
CREATE TABLE IF NOT EXISTS public.admin_notify_state (
  id           text PRIMARY KEY DEFAULT 'singleton',
  last_run_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notify_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin notify state admin all" ON public.admin_notify_state;
CREATE POLICY "admin notify state admin all" ON public.admin_notify_state
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_email_templates_updated ON public.email_templates;
  CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── CTA op e-mailtemplates (additief, backward-compatible) ────────────────────
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS cta_link text;

-- ── Rapportlog-velden op email_messages (admin-rapportmails) ──────────────────
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS trigger_type text,      -- 'auto' | 'manual' | 'event'
  ADD COLUMN IF NOT EXISTS item_count   integer,
  ADD COLUMN IF NOT EXISTS related_id   text;       -- gerelateerde aanvraag/klant/script

-- ── Throttle voor event-gedreven adminmails (1 mail per sleutel per uur) ───────
-- Bv. key = 'scripts:<client_id>' → max één scriptmelding per klant per uur.
CREATE TABLE IF NOT EXISTS public.admin_notify_throttle (
  key          text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notify_throttle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin throttle admin all" ON public.admin_notify_throttle;
CREATE POLICY "admin throttle admin all" ON public.admin_notify_throttle
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── client_tasks: taken die admin aan een klant geeft (alle diensten) ─────────
CREATE TABLE IF NOT EXISTS public.client_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  deadline      date,
  priority      text NOT NULL DEFAULT 'normaal',  -- laag | normaal | hoog
  status        text NOT NULL DEFAULT 'open',      -- open | in_progress | done | cancelled
  attachment_path text,
  attachment_name text,
  client_note   text,
  completed_at  timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_tasks ADD COLUMN IF NOT EXISTS attachment_name text;
CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON public.client_tasks (client_id);

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client tasks admin all"  ON public.client_tasks;
DROP POLICY IF EXISTS "client tasks read own"   ON public.client_tasks;
CREATE POLICY "client tasks admin all" ON public.client_tasks
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "client tasks read own" ON public.client_tasks
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_client_tasks_updated ON public.client_tasks;
  CREATE TRIGGER trg_client_tasks_updated BEFORE UPDATE ON public.client_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── invoices: interne factuuropvolging, gekoppeld aan revenue_entries ─────────
-- Geen boekhoudpakket: enkel "wat moeten we factureren / gefactureerd / betaald"
-- en de koppeling met de omzetmodule. Bedragen excl. btw als basis.
CREATE TABLE IF NOT EXISTS public.invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_slug  text,
  invoice_month text NOT NULL,                  -- 'YYYY-MM'
  invoice_date  date,
  description   text,
  amount_excl   numeric NOT NULL DEFAULT 0,
  vat_pct       numeric NOT NULL DEFAULT 21,
  amount_incl   numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'te_factureren', -- te_factureren | gefactureerd | betaald | geannuleerd
  revenue_id    uuid REFERENCES public.revenue_entries(id) ON DELETE SET NULL,
  note          text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_month ON public.invoices (invoice_month);
CREATE INDEX IF NOT EXISTS idx_invoices_revenue ON public.invoices (revenue_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices admin all" ON public.invoices;
CREATE POLICY "invoices admin all" ON public.invoices
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_invoices_updated ON public.invoices;
  CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Blogs: per-klant instellingen + gegenereerde blogs + Framer-publicatie ────
-- Additieve kolommen op clients (bloginstellingen + Framer-config). API key wordt
-- versleuteld opgeslagen (AES-GCM, lib/crypto) — nooit als platte tekst exposen.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS blogs_inbegrepen              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blog_startdatum               date,
  ADD COLUMN IF NOT EXISTS blog_frequentie_maanden       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS blog_aantal_per_cyclus        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS blog_volgende_generatie_datum date,
  ADD COLUMN IF NOT EXISTS blog_brand_context            text,
  ADD COLUMN IF NOT EXISTS framer_project_url            text,
  ADD COLUMN IF NOT EXISTS framer_api_key                text,   -- AES-GCM encrypted
  ADD COLUMN IF NOT EXISTS framer_blog_collection_id     text,
  ADD COLUMN IF NOT EXISTS framer_field_map              jsonb;

CREATE TABLE IF NOT EXISTS public.blogs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titel            text NOT NULL DEFAULT '',
  slug             text NOT NULL DEFAULT '',
  content          text,
  meta_title       text,
  meta_description text,
  thumbnail_url    text,
  status           text NOT NULL DEFAULT 'klaar_voor_review', -- klaar_voor_review | goedgekeurd | gepubliceerd | gefaald
  gegenereerd_op   timestamptz NOT NULL DEFAULT now(),
  goedgekeurd_op   timestamptz,
  gepubliceerd_op  timestamptz,
  framer_item_id   text,
  foutmelding      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blogs_client ON public.blogs (client_id);
CREATE INDEX IF NOT EXISTS idx_blogs_status ON public.blogs (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blogs_client_slug ON public.blogs (client_id, slug);

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blogs admin all" ON public.blogs;
CREATE POLICY "blogs admin all" ON public.blogs
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_blogs_updated ON public.blogs;
  CREATE TRIGGER trg_blogs_updated BEFORE UPDATE ON public.blogs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Framer Manager: publicatielogs + laatste synchronisatie ───────────────────
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS framer_last_sync timestamptz;

CREATE TABLE IF NOT EXISTS public.framer_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  blog_id     uuid,
  actie       text NOT NULL,             -- connect | publish | deploy | disconnect | test
  status      text NOT NULL,             -- ok | gefaald
  foutmelding text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_framer_logs_client ON public.framer_logs (client_id);
CREATE INDEX IF NOT EXISTS idx_framer_logs_created ON public.framer_logs (created_at DESC);

ALTER TABLE public.framer_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "framer logs admin all" ON public.framer_logs;
CREATE POLICY "framer logs admin all" ON public.framer_logs
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── recurring_invoices: terugkerende facturatie-definities (auto per maand) ───
-- Verschijnen automatisch in elke maand tussen start- en eindmaand. Er worden
-- GEEN per-maand records aangemaakt; enkel de verstuur-status per maand wordt
-- bewaard in recurring_invoice_months.
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_slug  text,
  start_month   text NOT NULL,                 -- 'YYYY-MM'
  end_month     text,                          -- 'YYYY-MM' of NULL (open einde)
  description   text,
  amount_excl   numeric NOT NULL DEFAULT 0,
  vat_pct       numeric NOT NULL DEFAULT 21,
  amount_incl   numeric NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  revenue_id    uuid REFERENCES public.revenue_entries(id) ON DELETE SET NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring invoices admin all" ON public.recurring_invoices;
CREATE POLICY "recurring invoices admin all" ON public.recurring_invoices
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE TABLE IF NOT EXISTS public.recurring_invoice_months (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_id  uuid NOT NULL REFERENCES public.recurring_invoices(id) ON DELETE CASCADE,
  month         text NOT NULL,                 -- 'YYYY-MM'
  status        text NOT NULL DEFAULT 'verstuurd', -- te_versturen | verstuurd | geannuleerd
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_invoice_months_uniq ON public.recurring_invoice_months (recurring_id, month);
ALTER TABLE public.recurring_invoice_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recurring invoice months admin all" ON public.recurring_invoice_months;
CREATE POLICY "recurring invoice months admin all" ON public.recurring_invoice_months
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_recurring_invoices_updated ON public.recurring_invoices;
  CREATE TRIGGER trg_recurring_invoices_updated BEFORE UPDATE ON public.recurring_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  DROP TRIGGER IF EXISTS trg_recurring_invoice_months_updated ON public.recurring_invoice_months;
  CREATE TRIGGER trg_recurring_invoice_months_updated BEFORE UPDATE ON public.recurring_invoice_months FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── blog_accounts: zelfstandige blog/Framer-entiteit (optioneel klant-gekoppeld)
-- Blogs zijn niet langer verplicht aan een klant gekoppeld. Alle blog/Framer-
-- configuratie verhuist naar blog_accounts; client_id is optioneel.
CREATE TABLE IF NOT EXISTS public.blog_accounts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       text NOT NULL,
  website_url                text,
  framer_project_url         text,
  framer_api_key             text,           -- AES-GCM encrypted
  framer_blog_collection_id  text,
  framer_field_map           jsonb,
  frequentie_maanden         integer NOT NULL DEFAULT 1,
  aantal_per_cyclus          integer NOT NULL DEFAULT 1,
  startdatum                 date,
  volgende_generatie_datum   date,
  max_live_blogs             integer,
  briefing                   text,
  active                     boolean NOT NULL DEFAULT true,
  client_id                  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  framer_last_sync           timestamptz,
  created_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_accounts_client ON public.blog_accounts (client_id);

ALTER TABLE public.blog_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blog accounts admin all"  ON public.blog_accounts;
DROP POLICY IF EXISTS "blog accounts client read" ON public.blog_accounts;
CREATE POLICY "blog accounts admin all" ON public.blog_accounts
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "blog accounts client read" ON public.blog_accounts
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

-- framer_logs kan ook per blogaccount gelogd worden (zonder klant-FK).
ALTER TABLE public.framer_logs ADD COLUMN IF NOT EXISTS account_id uuid;

-- blogs koppelen aan een blogaccount; client_id wordt optioneel.
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.blog_accounts(id) ON DELETE CASCADE;
DO $$ BEGIN ALTER TABLE public.blogs ALTER COLUMN client_id DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_blogs_account ON public.blogs (account_id);

-- Wie heeft een blog (in het klantenportaal) laatst bewerkt?
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS laatst_bewerkt_door text;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS laatst_bewerkt_op   timestamptz;

-- Klant mag enkel de blogs van zijn eigen (gekoppelde) blogaccount LEZEN.
-- Bewerken loopt via de server-API (service role) zodat push-naar-Framer + logging
-- centraal en gecontroleerd gebeurt.
DROP POLICY IF EXISTS "blogs client read" ON public.blogs;
CREATE POLICY "blogs client read" ON public.blogs
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE owner_user_id = auth.uid()));

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_blog_accounts_updated ON public.blog_accounts;
  CREATE TRIGGER trg_blog_accounts_updated BEFORE UPDATE ON public.blog_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Datamigratie: bestaande klant-bloginstellingen → blogaccounts ─────────────
-- Idempotent: maakt enkel accounts voor klanten met blogs_inbegrepen die er nog
-- geen hebben, en koppelt bestaande blogs op basis van client_id.
DO $$
BEGIN
  INSERT INTO public.blog_accounts (name, website_url, framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map, frequentie_maanden, aantal_per_cyclus, startdatum, volgende_generatie_datum, briefing, active, client_id, framer_last_sync)
  SELECT c.company_name, c.website_url, c.framer_project_url, c.framer_api_key, c.framer_blog_collection_id, c.framer_field_map,
         COALESCE(c.blog_frequentie_maanden, 1), COALESCE(c.blog_aantal_per_cyclus, 1), c.blog_startdatum, c.blog_volgende_generatie_datum,
         c.blog_brand_context, true, c.id, c.framer_last_sync
  FROM public.clients c
  WHERE c.blogs_inbegrepen = true
    AND NOT EXISTS (SELECT 1 FROM public.blog_accounts a WHERE a.client_id = c.id);

  UPDATE public.blogs b
     SET account_id = a.id
    FROM public.blog_accounts a
   WHERE b.account_id IS NULL AND b.client_id IS NOT NULL AND a.client_id = b.client_id;
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Blogaccount polish: gecachte website-analyse + blog memory ────────────────
-- website_analysis: gestructureerde analyse (diensten, SEO-woorden, tone, CTA's,
-- FAQ's). Wordt NIET elke generatie opnieuw uitgevoerd — enkel bij "opnieuw
-- analyseren" of wanneer de briefing wijzigt (website_analyzed_at → NULL).
-- blog_memory: { topics:[], keywords:[], angles:[], ctas:[] } om herhaling te vermijden.
ALTER TABLE public.blog_accounts ADD COLUMN IF NOT EXISTS website_analysis    jsonb;
ALTER TABLE public.blog_accounts ADD COLUMN IF NOT EXISTS website_analyzed_at timestamptz;
ALTER TABLE public.blog_accounts ADD COLUMN IF NOT EXISTS blog_memory         jsonb;

-- ── Blogs: synchronisatiestatus + publicatiebeheer ────────────────────────────
-- sync_status: synced | pending | failed (NULL = nog niet gepubliceerd)
-- publish_mode: now | scheduled | auto   publish_at: geplande publicatiedatum
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS sync_status  text;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS publish_mode text NOT NULL DEFAULT 'now';
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS publish_at   timestamptz;

-- ── blog_versions: volledige versiegeschiedenis per blog ──────────────────────
CREATE TABLE IF NOT EXISTS public.blog_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id          uuid NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  titel            text,
  slug             text,
  content          text,
  meta_title       text,
  meta_description text,
  thumbnail_url    text,
  edited_by        text,            -- e-mail/identiteit van wie de wijziging deed
  change_summary   text,            -- korte omschrijving van wat gewijzigd werd
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_versions_blog ON public.blog_versions (blog_id, created_at DESC);

ALTER TABLE public.blog_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "blog versions admin all" ON public.blog_versions;
CREATE POLICY "blog versions admin all" ON public.blog_versions
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Alle kolommen, tabellen, policies en triggers staan nu in sync met de code.
