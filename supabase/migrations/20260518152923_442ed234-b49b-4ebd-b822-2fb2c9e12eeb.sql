CREATE TABLE public.social_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  service_contract_id uuid NULL,
  planned_date date NOT NULL,
  platform text NOT NULL DEFAULT 'instagram',
  content_type text NOT NULL DEFAULT 'post',
  title text NOT NULL,
  caption text NULL,
  script text NULL,
  media_notes text NULL,
  status text NOT NULL DEFAULT 'draft',
  client_feedback text NULL,
  reviewed_at timestamptz NULL,
  published_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_content_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_social_content_items_client_date
  ON public.social_content_items(client_id, planned_date DESC);

CREATE INDEX idx_social_content_items_service_contract
  ON public.social_content_items(service_contract_id);

CREATE INDEX idx_social_content_items_status
  ON public.social_content_items(status);

CREATE TRIGGER trg_social_content_items_updated_at
  BEFORE UPDATE ON public.social_content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "social content admin all"
  ON public.social_content_items
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "social content owner read with active contract"
  ON public.social_content_items
  FOR SELECT
  TO authenticated
  USING (
    client_id = public.current_client_id()
    AND EXISTS (
      SELECT 1
      FROM public.service_contracts sc
      WHERE sc.client_id = social_content_items.client_id
        AND sc.service_slug = 'social-media'
        AND sc.status = 'active'
        AND (
          social_content_items.service_contract_id IS NULL
          OR social_content_items.service_contract_id = sc.id
        )
    )
  );