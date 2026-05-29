
CREATE TABLE IF NOT EXISTS public.client_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_slug text NOT NULL CHECK (service_slug IN ('social-media','foto-video','grafisch-ontwerp','webdesign','marketing-consultancy','ads')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, service_slug)
);

ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_services admin all" ON public.client_services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "client_services owner read" ON public.client_services
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

CREATE TRIGGER trg_client_services_updated_at
  BEFORE UPDATE ON public.client_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_client_services_client ON public.client_services(client_id);
