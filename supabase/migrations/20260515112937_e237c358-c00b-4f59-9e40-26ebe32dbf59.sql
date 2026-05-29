-- Add multi-platform support to scripts
ALTER TABLE public.scripts
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{}';

-- Backfill from existing single platform column
UPDATE public.scripts
SET platforms = ARRAY[platform]
WHERE (platforms IS NULL OR array_length(platforms, 1) IS NULL)
  AND platform IS NOT NULL;