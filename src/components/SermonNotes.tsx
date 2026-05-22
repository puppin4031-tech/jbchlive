import { useEffect, useState, useRef } from 'react';
import { StickyNote, X, ImagePlus, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface NoteRow {
  id: string;
  sermon_id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
}

interface Props {
  sermonId: string;
  channelOwnerId?: string | null;
}

const MAX_IMAGE = 5 * 1024 * 1024;

const SermonNotes = ({ sermonId, channelOwnerId }: Props) => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; avatar?: string | null }>>({});
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<NoteRow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sermon_notes')
      .select('*')
      .eq('sermon_id', sermonId)
      .order('created_at', { ascending: false });
    if (error) { toast.error('노트를 불러올 수 없습니다'); setLoading(false); return; }
    const rows = (data || []) as NoteRow[];
    setNotes(rows);
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids);
      if (profs) setProfiles(Object.fromEntries(profs.map((p: any) => [p.user_id, { name: p.display_name || '사용자', avatar: p.avatar_url }])));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    load();
    const ch = supabase
      .channel(`sermon-notes:${sermonId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sermon_notes', filter: `sermon_id=eq.${sermonId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sermonId]);

  const handleFile = (f: File | null) => {
    if (!f) { setFile(null); setPreview(null); return; }
    if (!f.type.startsWith('image/')) { toast.error('이미지 파일만 업로드할 수 있습니다'); return; }
    if (f.size > MAX_IMAGE) { toast.error('이미지는 5MB 이하만 가능합니다'); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!user) { toast.error('로그인이 필요합니다'); navigate('/login'); return; }
    const text = content.trim();
    if (!text && !file) { toast.error('내용 또는 이미지를 추가해주세요'); return; }
    if (text.length > 2000) { toast.error('2000자 이내로 입력해주세요'); return; }
    setSubmitting(true);
    try {
      let image_url: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${sermonId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('sermon-notes').upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('sermon-notes').getPublicUrl(path);
        image_url = pub.publicUrl;
      }
      const { error } = await supabase.from('sermon_notes').insert({
        sermon_id: sermonId, user_id: user.id, content: text || null, image_url,
      });
      if (error) throw error;
      setContent(''); setFile(null); setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('노트가 등록되었습니다');
    } catch (e: any) {
      toast.error(e.message || '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const canDelete = (n: NoteRow) =>
    !!user && (n.user_id === user.id || isAdmin || (channelOwnerId && channelOwnerId === user.id));

  const remove = async (n: NoteRow) => {
    if (!confirm('노트를 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('sermon_notes').delete().eq('id', n.id);
    if (error) { toast.error('삭제 실패'); return; }
    toast.success('삭제되었습니다');
    setActive(null);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <StickyNote className="w-4 h-4" />
        노트 ({notes.length || ''})
      </Button>

      {/* List dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-5 pt-5 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-primary" /> 영상 노트
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-3">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : notes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10">아직 등록된 노트가 없습니다.<br/>첫 노트를 남겨보세요!</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {notes.map((n) => {
                  const p = profiles[n.user_id];
                  return (
                    <button
                      key={n.id}
                      onClick={() => setActive(n)}
                      className="text-left rounded-lg border border-border bg-card hover:border-primary transition-colors overflow-hidden group"
                    >
                      {n.image_url ? (
                        <div className="aspect-square bg-muted overflow-hidden">
                          <img src={n.image_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        </div>
                      ) : (
                        <div className="aspect-square bg-muted/50 p-3 flex items-center text-sm text-foreground line-clamp-6 whitespace-pre-wrap">
                          {n.content}
                        </div>
                      )}
                      <div className="px-2 py-1.5 flex items-center gap-1.5 text-xs">
                        {p?.avatar ? (
                          <img src={p.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted" />
                        )}
                        <span className="truncate text-muted-foreground">{p?.name || '사용자'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border px-5 py-3 bg-background">
            {!user ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">노트를 작성하려면 로그인하세요.</p>
                <Button size="sm" onClick={() => navigate('/login')}>로그인</Button>
              </div>
            ) : (
              <>
                {preview && (
                  <div className="relative inline-block mb-2">
                    <img src={preview} alt="" className="h-20 rounded-md object-cover" />
                    <button
                      onClick={() => handleFile(null)}
                      className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5"
                      aria-label="이미지 제거"
                    ><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="이 영상에 대한 노트를 남겨주세요…"
                  rows={2}
                  maxLength={2000}
                  className="resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} className="gap-1">
                    <ImagePlus className="w-4 h-4" /> 사진
                  </Button>
                  <Button onClick={submit} disabled={submitting || (!content.trim() && !file)} size="sm" className="gap-1">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 등록
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {active && (() => {
            const p = profiles[active.user_id];
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {p?.avatar ? (
                      <img src={p.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted" />
                    )}
                    <div className="flex flex-col items-start">
                      <span className="text-base">{p?.name || '사용자'}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {new Date(active.created_at).toLocaleString('ko-KR')}
                      </span>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {active.image_url && (
                    <img src={active.image_url} alt="" className="w-full rounded-lg max-h-[60vh] object-contain bg-muted" />
                  )}
                  {active.content && (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{active.content}</p>
                  )}
                  {canDelete(active) && (
                    <div className="pt-2 border-t border-border flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => remove(active)} className="text-destructive gap-1">
                        <Trash2 className="w-4 h-4" /> 삭제
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SermonNotes;
