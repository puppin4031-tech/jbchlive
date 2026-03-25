
-- 1. stream_url 보호: 소유자와 관리자만 stream_url 업데이트 가능하도록 별도 테이블로 분리하지 않고,
--    stream_url 컬럼을 channels에서 읽기는 허용하되 업데이트는 소유자/관리자만 가능 (이미 적용됨)
--    추가로: stream_url이 공개되어도 HLS URL이므로 보안 위험은 낮지만, 
--    빈 값으로 노출 방지를 위해 is_live=false일 때 null 반환하는 함수 생성

-- 2. 채널 삭제 정책: 소유자도 자신의 채널 삭제 가능하도록 추가
CREATE POLICY "Owners can delete own channels"
ON public.channels
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- 3. 스트림 키 삭제 정책: 소유자와 관리자가 삭제 가능하도록 추가
CREATE POLICY "Owners can delete stream key"
ON public.channel_stream_keys
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.channels WHERE channels.id = channel_stream_keys.channel_id AND channels.owner_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- 4. stream_url 업데이트 시 URL 형식 검증 트리거
CREATE OR REPLACE FUNCTION public.validate_stream_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stream_url IS NOT NULL AND NEW.stream_url !~ '^https?://' THEN
    RAISE EXCEPTION 'stream_url must be a valid HTTP/HTTPS URL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_stream_url_trigger
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW
EXECUTE FUNCTION public.validate_stream_url();

-- 5. video_url 및 thumbnail_url 검증 트리거 (sermons)
CREATE OR REPLACE FUNCTION public.validate_sermon_urls()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.video_url IS NOT NULL AND NEW.video_url !~ '^https?://' THEN
    RAISE EXCEPTION 'video_url must be a valid HTTP/HTTPS URL';
  END IF;
  IF NEW.thumbnail_url IS NOT NULL AND NEW.thumbnail_url !~ '^https?://' THEN
    RAISE EXCEPTION 'thumbnail_url must be a valid HTTP/HTTPS URL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_sermon_urls_trigger
BEFORE INSERT OR UPDATE ON public.sermons
FOR EACH ROW
EXECUTE FUNCTION public.validate_sermon_urls();
