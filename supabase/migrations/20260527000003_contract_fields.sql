-- Add AI-detected fields and admin-filled values to contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS detected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS field_values     jsonb NOT NULL DEFAULT '{}'::jsonb;
