-- RESET SCRIPT - deletes ALL client/portal data, keeps admin account
-- Run in Supabase SQL editor. Replace 'admin@nextgenmedia.be' with your actual admin email.

-- Step 1: Delete all application data (order matters for FK constraints)
DELETE FROM public.partner_ledger_entries;
DELETE FROM public.partner_settlements;
DELETE FROM public.revenue_entries;
DELETE FROM public.webdesign_change_requests;
DELETE FROM public.social_content_items;
DELETE FROM public.contract_events;
DELETE FROM public.contract_signatures;
DELETE FROM public.contracts;
DELETE FROM public.service_contracts;
DELETE FROM public.client_services;
DELETE FROM public.clients;
DELETE FROM public.partners;

-- Step 2: Delete non-admin users from auth.users
-- This also cascades to user_roles via ON DELETE CASCADE
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
);

-- Done. Admin account is preserved.
SELECT 'Database reset complete. Admin accounts preserved.' AS result;
