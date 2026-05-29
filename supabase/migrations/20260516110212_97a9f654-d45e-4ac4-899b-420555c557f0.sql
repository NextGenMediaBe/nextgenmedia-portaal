
-- 1. Enum for contract model
DO $$ BEGIN
  CREATE TYPE public.contract_model AS ENUM (
    'social_recurring',
    'webdesign_project',
    'webdesign_maintenance',
    'consultancy_hours',
    'design_project',
    'ads_retainer',
    'photo_video_project'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM (
    'draft','active','paused','ended','pending_renewal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. service_contracts table
CREATE TABLE IF NOT EXISTS public.service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  service_slug text NOT NULL,
  model public.contract_model NOT NULL,
  status public.contract_status NOT NULL DEFAULT 'active',
  start_date date,
  end_date date,
  renewal_reminder_at date,
  setup_fee numeric(12,2),
  monthly_fee numeric(12,2),
  hourly_rate numeric(12,2),
  hours_purchased numeric(10,2),
  hours_used numeric(10,2) DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_contracts_client ON public.service_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_service_contracts_renewal ON public.service_contracts(renewal_reminder_at) WHERE status = 'active';

ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_contracts admin all" ON public.service_contracts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "service_contracts owner read" ON public.service_contracts
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE TRIGGER trg_service_contracts_updated_at
  BEFORE UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Migrate existing data
-- Social Media contracts
INSERT INTO public.service_contracts
  (client_id, service_slug, model, status, start_date, end_date, renewal_reminder_at, config)
SELECT
  cs.client_id,
  'social-media',
  'social_recurring',
  'active',
  COALESCE(c.live_start_date, c.contract_start),
  c.contract_end,
  (c.contract_end - INTERVAL '30 days')::date,
  jsonb_build_object(
    'months', c.contract_months,
    'platforms', c.platforms,
    'posts_per_month', c.posts_per_month,
    'reels_per_month', c.reels_per_month,
    'stories_per_month', c.stories_per_month
  )
FROM public.client_services cs
JOIN public.clients c ON c.id = cs.client_id
WHERE cs.service_slug = 'social-media'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_contracts sc
    WHERE sc.client_id = cs.client_id AND sc.service_slug = 'social-media'
  );

-- Webdesign (project + optional maintenance)
INSERT INTO public.service_contracts
  (client_id, service_slug, model, status, start_date, setup_fee, config)
SELECT
  cs.client_id,
  'webdesign',
  'webdesign_project',
  'active',
  CURRENT_DATE,
  NULL,
  '{}'::jsonb
FROM public.client_services cs
WHERE cs.service_slug = 'webdesign'
  AND NOT EXISTS (
    SELECT 1 FROM public.service_contracts sc
    WHERE sc.client_id = cs.client_id
      AND sc.service_slug = 'webdesign'
      AND sc.model = 'webdesign_project'
  );

INSERT INTO public.service_contracts
  (client_id, service_slug, model, status, start_date, end_date, renewal_reminder_at, monthly_fee)
SELECT
  cs.client_id,
  'webdesign',
  'webdesign_maintenance',
  'active',
  CURRENT_DATE,
  (CURRENT_DATE + INTERVAL '1 year')::date,
  (CURRENT_DATE + INTERVAL '11 months')::date,
  NULL
FROM public.client_services cs
WHERE cs.service_slug = 'webdesign'
  AND COALESCE((cs.config->>'maintenance_included')::boolean, false) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.service_contracts sc
    WHERE sc.client_id = cs.client_id
      AND sc.service_slug = 'webdesign'
      AND sc.model = 'webdesign_maintenance'
  );

-- Other services: placeholder contracts
INSERT INTO public.service_contracts (client_id, service_slug, model, status, start_date)
SELECT cs.client_id, cs.service_slug,
  CASE cs.service_slug
    WHEN 'marketing-consultancy' THEN 'consultancy_hours'::public.contract_model
    WHEN 'grafisch-ontwerp' THEN 'design_project'::public.contract_model
    WHEN 'ads' THEN 'ads_retainer'::public.contract_model
    WHEN 'foto-video' THEN 'photo_video_project'::public.contract_model
  END,
  'draft',
  CURRENT_DATE
FROM public.client_services cs
WHERE cs.service_slug IN ('marketing-consultancy','grafisch-ontwerp','ads','foto-video')
  AND NOT EXISTS (
    SELECT 1 FROM public.service_contracts sc
    WHERE sc.client_id = cs.client_id AND sc.service_slug = cs.service_slug
  );
