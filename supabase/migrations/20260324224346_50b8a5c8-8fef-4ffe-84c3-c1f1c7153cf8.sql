-- Explicitly block INSERT on user_roles to prevent privilege escalation
CREATE POLICY "Block all inserts on user_roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (false);

-- Block UPDATE on user_roles
CREATE POLICY "Block all updates on user_roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (false);

-- Block DELETE on user_roles
CREATE POLICY "Block all deletes on user_roles"
ON public.user_roles FOR DELETE TO authenticated
USING (false);