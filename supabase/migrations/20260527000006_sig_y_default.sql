-- Update default signature Y-position from 75% to 25% (from top)
ALTER TABLE public.contracts ALTER COLUMN sig_y_pct SET DEFAULT 25;
-- Update any contracts that still have the old default value and are not yet signed
UPDATE public.contracts SET sig_y_pct = 25 WHERE sig_y_pct = 75 AND status NOT IN ('signed');
