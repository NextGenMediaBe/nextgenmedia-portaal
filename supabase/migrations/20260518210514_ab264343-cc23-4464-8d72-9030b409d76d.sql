
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmation_pdf_path text;

DROP TABLE IF EXISTS public.contract_pdf_fields;
