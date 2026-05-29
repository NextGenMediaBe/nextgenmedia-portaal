
DROP TABLE IF EXISTS public.contract_terms_acceptance CASCADE;
DROP TABLE IF EXISTS public.contract_templates CASCADE;
DROP TABLE IF EXISTS public.terms_versions CASCADE;
DROP TABLE IF EXISTS public.content_items CASCADE;
DROP TABLE IF EXISTS public.scripts CASCADE;
DROP TABLE IF EXISTS public.strategies CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

ALTER TABLE public.contracts
  ALTER COLUMN rendered_html DROP NOT NULL,
  DROP COLUMN IF EXISTS template_id,
  DROP COLUMN IF EXISTS terms_version_id,
  DROP COLUMN IF EXISTS variables;

CREATE TABLE public.contract_service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, service_contract_id)
);

ALTER TABLE public.contract_service_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csc admin all" ON public.contract_service_contracts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "csc owner read" ON public.contract_service_contracts
  FOR SELECT TO authenticated
  USING (contract_id IN (SELECT id FROM public.contracts WHERE client_id = current_client_id()));

CREATE INDEX idx_csc_contract ON public.contract_service_contracts(contract_id);
CREATE INDEX idx_csc_service ON public.contract_service_contracts(service_contract_id);

ALTER TABLE public.service_contracts ALTER COLUMN status SET DEFAULT 'pending'::contract_status;

DROP POLICY IF EXISTS "contracts admin all" ON storage.objects;
CREATE POLICY "contracts admin all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'contracts' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'contracts' AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "contracts owner read" ON storage.objects;
CREATE POLICY "contracts owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contracts'
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.pdf_path = storage.objects.name
        AND c.client_id = current_client_id()
    )
  );
