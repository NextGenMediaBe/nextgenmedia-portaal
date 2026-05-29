ALTER TABLE public.freelancer_assignments
  ADD COLUMN IF NOT EXISTS roles freelancer_role[] NOT NULL DEFAULT '{}';

-- Backfill roles from existing single role column
UPDATE public.freelancer_assignments
   SET roles = ARRAY[role]::freelancer_role[]
 WHERE (roles IS NULL OR array_length(roles, 1) IS NULL) AND role IS NOT NULL;