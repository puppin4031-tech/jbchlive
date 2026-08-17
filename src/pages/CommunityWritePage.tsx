import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import CommunityImage from '@/components/community/CommunityImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCommunityAttachments, useCommunityCategories, useCommunityPost } from '@/hooks/useCommunity';
import {
  ALLOWED_DOC_EXTENSIONS,
  FILE_BUCKET,
  IMAGE_BUCKET,
  MAX_FILES_PER_POST,
  MAX_IMAGES_PER_POST,
  UploadedDoc,
  formatBytes,
  uploadCommunityDoc,
  uploadCommunityImage,
} from '@/lib/communityMedia';

const CommunityWritePage = () => {
  const { postId } = useParams<{ postId: string }>();
  const isEdit = !!postId;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();

  const { data: categories = [] } = useCommunityCategories();
  const { data: existing } = useCommunityPost(postId);
  const { data: existingFiles = [] } = useCommunityAttachments(postId);

  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [removedDocIds, setRemovedDocIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const writableCategories = categories.filter((c) => isAdmin || !c.admin_only);

  useEffect(() => {
    if (categoryId || !writableCategories.length) return;
    const slug = searchParams.get('category');
    const preset = writableCategories.find((c) => c.slug === slug);
    setCategoryId(preset?.id || writableCategories[0].id);
  }, [writableCategories, searchParams, categoryId]);

  useEffect(() => {
    if (!existing) return;
    setCategoryId(existing.category_id);
    setTitle(existing.title);
    setTag(existing.tag || '');
    setBody(existing.body);
    setImages(existing.image_urls || []);
  }, [existing]);

  const keptFiles = existingFiles.filter((f: any) => !removedDocIds.includes(f.id));

  const pickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length || !user) return;
    if (images.length + files.length > MAX_IMAGES_PER_POST) {
      toast.error(`이미지는 최대 ${MAX_IMAGES_PER_POST}장까지 올릴 수 있습니다.`);
      return;
    }
    setBusy(true);
    try {
      for (const file of files) {
        const path = await uploadCommunityImage(file, user.id);
        setImages((prev) => [...prev, path]);
      }
      toast.success('이미지가 업로드되었습니다.');
    } catch (err: any) {
      toast.error(err?.message || '이미지 업로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pickDocs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length || !user) return;
    if (keptFiles.length + docs.length + files.length > MAX_FILES_PER_POST) {
      toast.error(`첨부파일은 최대 ${MAX_FILES_PER_POST}개까지 가능합니다.`);
      return;
    }
    setBusy(true);
    try {
      for (const file of files) {
        const doc = await uploadCommunityDoc(file, user.id);
        setDocs((prev) => [...prev, doc]);
      }
      toast.success('파일이 첨부되었습니다.');
    } catch (err: any) {
      toast.error(err?.message || '파일 업로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async (path: string) => {
    setImages((prev) => prev.filter((p) => p !== path));
    await supabase.storage.from(IMAGE_BUCKET).remove([path]).catch(() => undefined);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    if (!categoryId) {
      toast.error('카테고리를 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category_id: categoryId,
        title: title.trim(),
        tag: tag.trim() || null,
        body: body.trim(),
        image_urls: images,
      };

      let targetId = postId;
      if (isEdit) {
        const { error } = await supabase.from('community_posts').update(payload).eq('id', postId!);
        if (error) throw error;

        if (removedDocIds.length) {
          const removed = existingFiles.filter((f: any) => removedDocIds.includes(f.id));
          await supabase.storage.from(FILE_BUCKET).remove(removed.map((f: any) => f.file_path));
          await supabase.from('community_attachments').delete().in('id', removedDocIds);
        }
      } else {
        const { data, error } = await supabase
          .from('community_posts')
          .insert({ ...payload, author_id: user.id })
          .select('id')
          .single();
        if (error) throw error;
        targetId = data.id;
      }

      if (docs.length && targetId) {
        const { error } = await supabase
          .from('community_attachments')
          .insert(docs.map((d) => ({ ...d, post_id: targetId })));
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ['community-posts'] });
      qc.invalidateQueries({ queryKey: ['community-post', targetId] });
      qc.invalidateQueries({ queryKey: ['community-attachments', targetId] });
      toast.success(isEdit ? '수정되었습니다.' : '게시글이 등록되었습니다.');
      navigate(`/community/${targetId}`);
    } catch (err: any) {
      toast.error(err?.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <Header />
      <main className="container px-4 py-4 max-w-3xl space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-lg md:text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5 md:w-4 md:h-4" /> 뒤로
        </button>
        <h1 className="text-2xl md:text-xl font-bold text-foreground">
          {isEdit ? '글 수정' : '글쓰기'}
        </h1>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-base md:text-sm font-medium text-foreground">카테고리</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-12 md:h-9 text-lg md:text-sm">
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {writableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-lg md:text-sm">
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-3">
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="말머리 (예: 노하우)"
              className="h-12 md:h-9 text-lg md:text-sm"
              maxLength={12}
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="h-12 md:h-9 text-lg md:text-sm"
              maxLength={120}
            />
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="내용을 입력하세요"
            className="min-h-48 text-lg md:text-sm"
          />

          {/* 이미지 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base md:text-sm font-medium text-foreground">
                이미지 ({images.length}/{MAX_IMAGES_PER_POST})
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-8 text-base md:text-xs"
                disabled={busy}
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-1" /> 이미지 추가
              </Button>
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={pickImages}
              />
            </div>
            <p className="text-sm md:text-xs text-muted-foreground">
              업로드 시 자동으로 WebP로 압축됩니다. 영상 파일은 업로드할 수 없습니다.
            </p>
            {images.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {images.map((path) => (
                  <div key={path} className="relative">
                    <CommunityImage path={path} className="w-full aspect-video rounded-lg object-cover" />
                    <button
                      type="button"
                      aria-label="이미지 삭제"
                      onClick={() => removeImage(path)}
                      className="absolute top-1 right-1 w-8 h-8 rounded-full bg-background/90 border border-border flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 첨부파일 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base md:text-sm font-medium text-foreground">
                첨부파일 ({keptFiles.length + docs.length}/{MAX_FILES_PER_POST})
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-8 text-base md:text-xs"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="w-4 h-4 mr-1" /> 파일 첨부
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={ALLOWED_DOC_EXTENSIONS.map((e) => `.${e}`).join(',')}
                multiple
                className="hidden"
                onChange={pickDocs}
              />
            </div>
            <p className="text-sm md:text-xs text-muted-foreground">
              PDF, PPT, DOC, XLS · 파일당 10MB 이하
            </p>
            {(keptFiles.length > 0 || docs.length > 0) && (
              <ul className="space-y-2">
                {keptFiles.map((f: any) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="text-base md:text-sm truncate">{f.file_name}</span>
                    <button
                      type="button"
                      aria-label="첨부 삭제"
                      onClick={() => setRemovedDocIds((prev) => [...prev, f.id])}
                      className="p-2 -m-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                {docs.map((d) => (
                  <li key={d.file_path} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <span className="text-base md:text-sm truncate">
                      {d.file_name} <span className="text-muted-foreground">({formatBytes(d.file_size)})</span>
                    </span>
                    <button
                      type="button"
                      aria-label="첨부 삭제"
                      onClick={() => setDocs((prev) => prev.filter((x) => x.file_path !== d.file_path))}
                      className="p-2 -m-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button type="submit" disabled={saving || busy} className="w-full h-14 md:h-10 text-lg md:text-sm">
            {(saving || busy) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? '수정 완료' : '등록하기'}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default CommunityWritePage;
