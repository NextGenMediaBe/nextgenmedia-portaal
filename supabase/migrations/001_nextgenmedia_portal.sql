-- NextGenMedia Portal — baseline migration
-- Run this against your Supabase project via the SQL editor or CLI.
-- Tables that already exist in your project are created with IF NOT EXISTS.
-- New columns are added with IF NOT EXISTS guards where supported.

-- ─────────────────────────────────────────
-- user_roles
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('admin', 'client', 'freelancer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- ─────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_name    text NOT NULL,
  contact_name    text,
  email           text,
  website_url     text,
  niche           text,
  revenue_value   numeric(12,2),
  revenue_type    text CHECK (revenue_type IN ('recurring', 'one_off')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='contact_name') THEN
    ALTER TABLE clients ADD COLUMN contact_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='revenue_value') THEN
    ALTER TABLE clients ADD COLUMN revenue_value numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='revenue_type') THEN
    ALTER TABLE clients ADD COLUMN revenue_type text CHECK (revenue_type IN ('recurring', 'one_off'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='niche') THEN
    ALTER TABLE clients ADD COLUMN niche text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='website_url') THEN
    ALTER TABLE clients ADD COLUMN website_url text;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- client_services
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_slug text NOT NULL,
  active       boolean NOT NULL DEFAULT false,
  config       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, service_slug)
);

-- ─────────────────────────────────────────
-- service_contracts
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_slug   text NOT NULL,
  start_date     date,
  duration_months int,
  end_date       date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- contracts
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','cancelled')),
  pdf_url       text,
  access_token  uuid NOT NULL DEFAULT gen_random_uuid(),
  signer_name   text,
  signer_email  text,
  signed_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='signed_at') THEN
    ALTER TABLE contracts ADD COLUMN signed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contracts' AND column_name='access_token') THEN
    ALTER TABLE contracts ADD COLUMN access_token uuid NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

-- ─────────────────────────────────────────
-- contract_signatures
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  signer_name     text NOT NULL,
  signer_email    text NOT NULL,
  signer_phone    text,
  signer_address  text,
  signer_vat      text,
  signature_url   text,
  signed_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_signatures' AND column_name='signer_phone') THEN
    ALTER TABLE contract_signatures ADD COLUMN signer_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_signatures' AND column_name='signer_address') THEN
    ALTER TABLE contract_signatures ADD COLUMN signer_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_signatures' AND column_name='signer_vat') THEN
    ALTER TABLE contract_signatures ADD COLUMN signer_vat text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_signatures' AND column_name='signature_url') THEN
    ALTER TABLE contract_signatures ADD COLUMN signature_url text;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- contract_events
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- social_content_items
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title            text NOT NULL,
  body             text,
  platform         text,
  content_type     text,
  status           text NOT NULL DEFAULT 'draft',
  scheduled_date   date,
  published_at     timestamptz,
  client_feedback  text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- freelancers (partners)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freelancers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text NOT NULL,
  email           text NOT NULL,
  phone           text,
  company         text,
  vat_number      text,
  roles           jsonb NOT NULL DEFAULT '[]',
  commission_pct  numeric(5,2) NOT NULL DEFAULT 10,
  hourly_rate     numeric(10,2),
  region          text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- freelancer_assignments
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freelancer_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id  uuid NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  client_id      uuid REFERENCES clients(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  service_slug   text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  budget         numeric(10,2),
  payout         numeric(10,2),
  deadline       date,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- webdesign_change_requests
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webdesign_change_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  kind        text NOT NULL DEFAULT 'other',
  status      text NOT NULL DEFAULT 'new',
  image_urls  jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- Storage buckets (run via Supabase dashboard or CLI)
-- ─────────────────────────────────────────
-- Buckets needed:
--   contracts       (private, allow admin reads/writes via service role)
--   webdesign-uploads (public reads, admin writes)
--
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('contracts', 'contracts', false),
--   ('webdesign-uploads', 'webdesign-uploads', true)
-- ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────
-- RLS: enable on all tables, admin bypasses via service role key
-- ─────────────────────────────────────────
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE webdesign_change_requests ENABLE ROW LEVEL SECURITY;

-- Clients can read their own data
CREATE POLICY "clients_own_read" ON clients
  FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "clients_own_services" ON client_services
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "clients_own_service_contracts" ON service_contracts
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "clients_own_contracts" ON contracts
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "clients_own_content" ON social_content_items
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "clients_review_content" ON social_content_items
  FOR UPDATE USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "clients_own_webdesign" ON webdesign_change_requests
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE owner_user_id = auth.uid())
  );

-- Freelancers can read their own data
CREATE POLICY "freelancers_own_read" ON freelancers
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "freelancers_own_assignments" ON freelancer_assignments
  FOR SELECT USING (
    freelancer_id IN (SELECT id FROM freelancers WHERE user_id = auth.uid())
  );

-- user_roles: users can read their own role
CREATE POLICY "user_roles_own" ON user_roles
  FOR SELECT USING (user_id = auth.uid());
