drop table if exists public.quote_uploads cascade;
drop table if exists public.quote_items cascade;
drop table if exists public.quote_requests cascade;
alter table public.freelancer_assignments drop column if exists quote_id;