-- 1. service_contracts additions
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS maintenance_included boolean NOT NULL DEFAULT false;

-- 2. helper function
CREATE OR REPLACE FUNCTION public.client_has_active_service(_client_id uuid, _service_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_contracts sc
    WHERE sc.client_id = _client_id
      AND sc.service_slug = _service_slug
      AND sc.status = 'active'
      AND sc.activated_at IS NOT NULL
  )
$$;

-- 3. trigger: when a contract goes to signed, activate linked service contract
CREATE OR REPLACE FUNCTION public.activate_service_on_contract_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed') AND NEW.service_contract_id IS NOT NULL THEN
    UPDATE public.service_contracts
       SET status = 'active',
           activated_at = COALESCE(activated_at, now()),
           start_date = COALESCE(start_date, CURRENT_DATE)
     WHERE id = NEW.service_contract_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activate_service_on_contract_signed ON public.contracts;
CREATE TRIGGER trg_activate_service_on_contract_signed
AFTER UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.activate_service_on_contract_signed();

-- 4. design_intakes
CREATE TABLE IF NOT EXISTS public.design_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  service_contract_id uuid,
  mission text,
  audience text,
  style text,
  colors text,
  "references" text,
  goals text,
  competitors text,
  inspirations text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.design_intakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "design_intakes admin all" ON public.design_intakes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "design_intakes owner read" ON public.design_intakes
  FOR SELECT TO authenticated
  USING (client_id = current_client_id());

CREATE POLICY "design_intakes owner insert" ON public.design_intakes
  FOR INSERT TO authenticated
  WITH CHECK (client_id = current_client_id());

CREATE POLICY "design_intakes owner update" ON public.design_intakes
  FOR UPDATE TO authenticated
  USING (client_id = current_client_id());

CREATE TRIGGER trg_design_intakes_updated
BEFORE UPDATE ON public.design_intakes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. webdesign_change_requests
CREATE TABLE IF NOT EXISTS public.webdesign_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  service_contract_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  estimated_hours numeric,
  estimated_cost numeric,
  hourly_rate numeric NOT NULL DEFAULT 95,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webdesign_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wd_changes admin all" ON public.webdesign_change_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "wd_changes owner read" ON public.webdesign_change_requests
  FOR SELECT TO authenticated
  USING (client_id = current_client_id());

CREATE POLICY "wd_changes owner insert" ON public.webdesign_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (client_id = current_client_id());

CREATE TRIGGER trg_wd_changes_updated
BEFORE UPDATE ON public.webdesign_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. production_tasks
CREATE TABLE IF NOT EXISTS public.production_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  social_content_item_id uuid,
  service_contract_id uuid,
  type text NOT NULL DEFAULT 'shoot',
  status text NOT NULL DEFAULT 'open',
  title text,
  notes text,
  scheduled_for date,
  deadline date,
  assigned_freelancer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_tasks admin all" ON public.production_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "production_tasks freelancer read" ON public.production_tasks
  FOR SELECT TO authenticated
  USING (assigned_freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE POLICY "production_tasks freelancer update" ON public.production_tasks
  FOR UPDATE TO authenticated
  USING (assigned_freelancer_id IN (SELECT id FROM public.freelancers WHERE user_id = auth.uid()));

CREATE TRIGGER trg_production_tasks_updated
BEFORE UPDATE ON public.production_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. tighten social_content_items visibility via helper function
DROP POLICY IF EXISTS "social content owner read with active contract" ON public.social_content_items;
CREATE POLICY "social_content owner read active"
  ON public.social_content_items
  FOR SELECT TO authenticated
  USING (
    client_id = current_client_id()
    AND public.client_has_active_service(client_id, 'social-media')
  );
