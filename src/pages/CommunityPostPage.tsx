import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import CommunityImage from '@/components/community/CommunityImage';
import CommentSection from '@/components/community/CommentSection';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCommunityAttachments, useCommunityPost } from '@/hooks/useCommunity';
import { FILE_BUCKET, IMAGE_BUCKET, formatBytes, getSignedUrl } from '@/lib/communityMedia';

const CommunityPostPage = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { data: post, isLoading } = useCommunityPost(postId);
  const { data: attachments = [] } = useCommunityAttachments(postId);

  useEffect(() => {
    if (!postId) return;
    supabase.rpc('increment_community_post_view', { _post_id: postId });
  }, [postId]);

  const canEdit = !!user && (user.id === post?.author_id || isAdmin);

  const download = async (path: string, name: string) => {
    try {
      const url = await getSignedUrl(FILE_BUCKET, path, 300);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } catch (err: any) {
      toast.error(err?.message || '다운로드에 실패했습니다.');
    }
  };

  const removePost = async () => {
    if (!post || !window.confirm('이 글을 삭제할까요?')) return;
    try {
      if (post.image_urls?.length) {
        await supabase.storage.from(IMAGE_BUCKET).remove(post.image_urls);
      }
      if (attachments.length) {
        await supabase.storage.from(FILE_BUCKET).remove(attachments.map((a: any) => a.file_path));
      }
      const { error } = await supabase.from('community_posts').delete().eq('id', post.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['community-posts'] });
      toast.success('삭제되었습니다.');
      navigate('/community');
    } catch (err: any) {
      toast.error(err?.message || '삭제에 실패했습니다.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mt-20" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <p className="text-center text-lg text-muted-foreground mt-20">글을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <Header />
      <main className="container px-4 py-4 max-w-3xl space-y-6">
        <Link
          to={post.categorySlug ? `/community/category/${post.categorySlug}` : '/community'}
          className="inline-flex items-center gap-2 text-lg md:text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5 md:w-4 md:h-4" /> {post.categoryName || '커뮤니티'}
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl md:text-xl font-bold text-foreground break-words">
            {post.tag && <span className="text-primary">[{post.tag}] </span>}
            {post.title}
          </h1>
          <div className="flex items-center gap-4 text-base md:text-xs text-muted-foreground">
            <span>{post.authorName}</span>
            <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" /> {post.view_count}
            </span>
          </div>
          {canEdit && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="h-11 md:h-8 text-base md:text-xs"
                onClick={() => navigate(`/community/${post.id}/edit`)}
              >
                <Pencil className="w-4 h-4 mr-1" /> 수정
              </Button>
              <Button variant="destructive" className="h-11 md:h-8 text-base md:text-xs" onClick={removePost}>
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            </div>
          )}
        </header>

        {post.image_urls?.length > 0 && (
          <div className="space-y-3">
            {post.image_urls.map((path) => (
              <CommunityImage
                key={path}
                path={path}
                alt={post.title}
                className="w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        <p className="text-lg md:text-base leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {post.body}
        </p>

        {attachments.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg md:text-sm font-semibold text-foreground">첨부파일</h2>
            <ul className="space-y-2">
              {attachments.map((a: any) => (
                <li key={a.id}>
                  <button
                    onClick={() => download(a.file_path, a.file_name)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/60"
                  >
                    <span className="text-base md:text-sm text-foreground truncate">{a.file_name}</span>
                    <span className="shrink-0 flex items-center gap-2 text-sm md:text-xs text-muted-foreground">
                      {formatBytes(a.file_size)} <Download className="w-4 h-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <CommentSection postId={post.id} />
      </main>
    </div>
  );
};

export default CommunityPostPage;
