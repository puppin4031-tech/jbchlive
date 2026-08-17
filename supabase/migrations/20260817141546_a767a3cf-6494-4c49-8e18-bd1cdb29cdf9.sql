-- 1. Categories
CREATE TABLE public.community_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  admin_only boolean NOT NULL DEFAULT false,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_categories TO authenticated;
GRANT ALL ON public.community_categories TO service_role;
ALTER TABLE public.community_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_select_auth" ON public.community_categories
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.community_categories (slug, name, sort_order, admin_only, icon) VALUES
  ('notice', '필독/공지사항', 1, true, '📢'),
  ('board', '게시판', 2, false, '💡'),
  ('media', '미디어나눔', 3, false, '🖼️'),
  ('files', '자료실', 4, false, '📁'),
  ('talk', '자유수다', 5, false, '💬');

-- 2. Posts
CREATE TABLE public.community_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.community_categories(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  tag text,
  image_urls text[] NOT NULL DEFAULT '{}',
  view_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_posts_category ON public.community_posts(category_id, created_at DESC);
CREATE INDEX idx_community_posts_created ON public.community_posts(created_at DESC);
CREATE INDEX idx_community_posts_author ON public.community_posts(author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_posts TO authenticated;
GRANT ALL ON public.community_posts TO service_role;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select_auth" ON public.community_posts
  FOR SELECT TO authenticated
  USING (is_hidden = false OR author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "posts_insert_own" ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.community_categories c
        WHERE c.id = category_id AND c.admin_only = true
      )
    )
  );

CREATE POLICY "posts_update_own_or_admin" ON public.community_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "posts_delete_own_or_admin" ON public.community_posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_community_posts_updated
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Attachments
CREATE TABLE public.community_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_attachments_post ON public.community_attachments(post_id);

GRANT SELECT, INSERT, DELETE ON public.community_attachments TO authenticated;
GRANT ALL ON public.community_attachments TO service_role;
ALTER TABLE public.community_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select_auth" ON public.community_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "attachments_insert_post_owner" ON public.community_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = post_id AND (p.author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

CREATE POLICY "attachments_delete_post_owner" ON public.community_attachments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = post_id AND (p.author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  ));

-- 4. Comments
CREATE TABLE public.community_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  parent_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_comments_post ON public.community_comments(post_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_comments TO authenticated;
GRANT ALL ON public.community_comments TO service_role;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_auth" ON public.community_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "comments_insert_own" ON public.community_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments_update_own" ON public.community_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments_delete_own_or_admin" ON public.community_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_community_comments_updated
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Comment count sync
CREATE OR REPLACE FUNCTION public.sync_community_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_community_comment_count_ins
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_comment_count();
CREATE TRIGGER trg_community_comment_count_del
  AFTER DELETE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_community_comment_count();

-- 6. View counter (auth users only)
CREATE OR REPLACE FUNCTION public.increment_community_post_view(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.community_posts SET view_count = view_count + 1 WHERE id = _post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_community_post_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_community_post_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_community_post_view(uuid) TO service_role;