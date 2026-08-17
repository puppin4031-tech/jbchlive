import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommunityCategory {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  admin_only: boolean;
  icon: string | null;
}

export interface CommunityPost {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: string;
  tag: string | null;
  image_urls: string[];
  view_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
  authorName?: string;
  categorySlug?: string;
  categoryName?: string;
}

const STALE = 60_000;

export const useCommunityCategories = () =>
  useQuery({
    queryKey: ['community-categories'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CommunityCategory[]> => {
      const { data, error } = await supabase
        .from('community_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data || []) as CommunityCategory[];
    },
  });

const attachMeta = async (rows: any[]): Promise<CommunityPost[]> => {
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const categoryIds = [...new Set(rows.map((r) => r.category_id))];

  const [{ data: profiles }, { data: categories }] = await Promise.all([
    supabase.from('profiles').select('user_id, display_name').in('user_id', authorIds),
    supabase.from('community_categories').select('id, slug, name').in('id', categoryIds),
  ]);

  const nameByUser = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));
  const catById = new Map((categories || []).map((c: any) => [c.id, c]));

  return rows.map((r) => ({
    ...r,
    authorName: nameByUser.get(r.author_id) || '익명',
    categorySlug: catById.get(r.category_id)?.slug,
    categoryName: catById.get(r.category_id)?.name,
  })) as CommunityPost[];
};

interface PostsOptions {
  categorySlug?: string;
  search?: string;
  limit?: number;
  enabled?: boolean;
  orderBy?: 'created_at' | 'view_count';
}

export const useCommunityPosts = ({
  categorySlug,
  search,
  limit = 20,
  enabled = true,
  orderBy = 'created_at',
}: PostsOptions = {}) =>
  useQuery({
    queryKey: ['community-posts', categorySlug ?? 'all', search ?? '', limit, orderBy],
    staleTime: STALE,
    enabled,
    queryFn: async (): Promise<CommunityPost[]> => {
      let categoryId: string | undefined;
      if (categorySlug && categorySlug !== 'all') {
        const { data: cat } = await supabase
          .from('community_categories')
          .select('id')
          .eq('slug', categorySlug)
          .maybeSingle();
        if (!cat) return [];
        categoryId = cat.id;
      }

      let q = supabase
        .from('community_posts')
        .select('*')
        .eq('is_hidden', false)
        .order(orderBy, { ascending: false })
        .limit(limit);

      if (categoryId) q = q.eq('category_id', categoryId);
      if (search?.trim()) {
        const term = search.trim().replace(/[%,]/g, '');
        q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return attachMeta(data || []);
    },
  });

export const useCommunityPost = (postId?: string) =>
  useQuery({
    queryKey: ['community-post', postId],
    enabled: !!postId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('id', postId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [post] = await attachMeta([data]);
      return post;
    },
  });

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  authorName?: string;
}

export const useCommunityComments = (postId?: string) =>
  useQuery({
    queryKey: ['community-comments', postId],
    enabled: !!postId,
    staleTime: 30_000,
    queryFn: async (): Promise<CommunityComment[]> => {
      const { data, error } = await supabase
        .from('community_comments')
        .select('*')
        .eq('post_id', postId!)
        .order('created_at');
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) return [];
      const ids = [...new Set(rows.map((r) => r.author_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', ids);
      const nameByUser = new Map((profiles || []).map((p: any) => [p.user_id, p.display_name]));
      return rows.map((r) => ({ ...r, authorName: nameByUser.get(r.author_id) || '익명' }));
    },
  });

export const useCommunityAttachments = (postId?: string) =>
  useQuery({
    queryKey: ['community-attachments', postId],
    enabled: !!postId,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_attachments')
        .select('*')
        .eq('post_id', postId!)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });
