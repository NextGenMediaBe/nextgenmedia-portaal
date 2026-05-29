
-- Make freelancer assignments support open/claimable pool
ALTER TABLE public.freelancer_assignments
  ALTER COLUMN freelancer_id DROP NOT NULL;

ALTER TABLE public.freelancer_assignments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS budget numeric,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS service_contract_id uuid REFERENCES public.service_contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_open ON public.freelancer_assignments(status) WHERE freelancer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_service_contract ON public.freelancer_assignments(service_contract_id);

-- Allow any active freelancer to read OPEN (unassigned) assignments
DROP POLICY IF EXISTS "freelancer assignments open read" ON public.freelancer_assignments;
CREATE POLICY "freelancer assignments open read"
ON public.freelancer_assignments
FOR SELECT
TO authenticated
USING (
  freelancer_id IS NULL
  AND status = 'open'
  AND EXISTS (
    SELECT 1 FROM public.freelancers f
    WHERE f.user_id = auth.uid() AND f.status = 'active'
  )
);
