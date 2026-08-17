import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCommunityComments } from '@/hooks/useCommunity';

const CommentSection = ({ postId }: { postId: string }) => {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: comments = [], isLoading } = useCommunityComments(postId);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['community-comments', postId] });
    qc.invalidateQueries({ queryKey: ['community-post', postId] });
    qc.invalidateQueries({ queryKey: ['community-posts'] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !body.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('community_comments')
        .insert({ post_id: postId, author_id: user.id, body: body.trim() });
      if (error) throw error;
      setBody('');
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '댓글 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from('community_comments').delete().eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      toast.error(err?.message || '삭제에 실패했습니다.');
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl md:text-base font-semibold text-foreground">
        댓글 {comments.length}
      </h2>

      {user && (
        <form onSubmit={submit} className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="따뜻한 댓글을 남겨주세요."
            className="min-h-24 text-lg md:text-sm"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !body.trim()} className="h-12 md:h-9 text-lg md:text-sm">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              등록
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="text-lg md:text-sm text-muted-foreground">첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-border pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base md:text-sm font-medium text-foreground">{c.authorName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm md:text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                  </span>
                  {(user?.id === c.author_id || isAdmin) && (
                    <button
                      onClick={() => remove(c.id)}
                      aria-label="댓글 삭제"
                      className="text-muted-foreground hover:text-destructive p-2 -m-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-lg md:text-sm text-foreground whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CommentSection;
