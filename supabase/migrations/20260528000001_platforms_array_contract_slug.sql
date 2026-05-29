-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: multi-channel support + contract service tagging + access gating
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add platforms[] to social_content_items
--    Each item can target multiple social channels simultaneously.
ALTER TABLE public.social_content_items
  ADD COLUMN IF NOT EXISTS platforms text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: copy existing single-platform value into the array
UPDATE public.social_content_items
  SET platforms = ARRAY[platform]
  WHERE platform IS NOT NULL
    AND platforms = '{}'::text[];

-- 2. Add service_slug to contracts
--    Indicates which service this physical contract covers (for portal-access gating).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS service_slug text;

-- 3. Change client_services.active default to false
--    Portal access must now be explicitly granted by admin AFTER contract is signed.
ALTER TABLE public.client_services
  ALTER COLUMN active SET DEFAULT false;

-- Existing rows are NOT changed (grandfathered in as active).
-- Only NEW client_services rows will default to false.
