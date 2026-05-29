ALTER TABLE public.contract_pdf_fields
  DROP CONSTRAINT IF EXISTS contract_pdf_fields_field_type_check;

ALTER TABLE public.contract_pdf_fields
  ADD CONSTRAINT contract_pdf_fields_field_type_check
  CHECK (field_type IN ('text','name','first_name','company','address','vat','email','phone','date','initials','signature','checkbox'));
