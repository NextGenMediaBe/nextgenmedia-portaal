ALTER TABLE public.webdesign_change_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'minor' CHECK (kind IN ('minor','major'));