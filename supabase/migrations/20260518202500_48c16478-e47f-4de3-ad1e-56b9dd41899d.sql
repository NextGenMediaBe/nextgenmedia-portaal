
-- Contract PDF field mapping
CREATE TABLE public.contract_pdf_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  page integer NOT NULL DEFAULT 1,
  x numeric NOT NULL,
  y numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','name','company','address','vat','email','phone','date','initials','signature','checkbox')),
  label text NOT NULL DEFAULT '',
  placeholder text,
  required boolean NOT NULL DEFAULT true,
  filled_by text NOT NULL DEFAULT 'client' CHECK (filled_by IN ('client','admin')),
  sort_order integer NOT NULL DEFAULT 0,
  value text,
  signature_data text,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_pdf_fields_contract ON public.contract_pdf_fields(contract_id);

ALTER TABLE public.contract_pdf_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdf_fields admin all" ON public.contract_pdf_fields
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pdf_fields owner read" ON public.contract_pdf_fields
  FOR SELECT TO authenticated
  USING (contract_id IN (SELECT id FROM contracts WHERE client_id = current_client_id()));

CREATE TRIGGER trg_pdf_fields_updated_at
  BEFORE UPDATE ON public.contract_pdf_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Signed PDF path
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS signed_pdf_path text;
