-- Add title and billing_frequency columns to revenue_entries
-- These are required by the revenue form (added in the 20260527 session).
-- Safe to run multiple times (IF NOT EXISTS / default).

ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'monthly';
