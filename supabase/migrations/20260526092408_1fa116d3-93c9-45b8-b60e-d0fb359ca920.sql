
-- 1. Remove overly broad quote-uploads insert policy
DROP POLICY IF EXISTS "quote uploads public insert" ON storage.objects;

-- 2. Lock down user_roles writes to admins only (restrictive policy)
CREATE POLICY "roles only admins can write"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Revoke public EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_service_on_contract_signed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- For functions used inside RLS policies, restrict to authenticated only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_client_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_has_active_service(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_has_active_service(uuid, text) TO authenticated;
