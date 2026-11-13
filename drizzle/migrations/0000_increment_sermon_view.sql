CREATE OR REPLACE FUNCTION public.increment_sermon_view(_sermon_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.sermons SET view_count = view_count + 1
  WHERE id = _sermon_id AND is_hidden = false
  RETURNING view_count INTO v_count;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_sermon_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_sermon_view(uuid) TO anon, authenticated, service_role;