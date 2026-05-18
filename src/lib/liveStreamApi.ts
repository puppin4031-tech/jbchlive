import { supabase } from "@/integrations/supabase/client";

const invoke = async (action: string, params: Record<string, unknown> = {}) => {
  const cleanParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) cleanParams[k] = v;
  }
  const { data, error } = await supabase.functions.invoke("live-stream", {
    body: { action, ...cleanParams },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

/** GCP Live Stream Input + Channel 프로비저닝 (관리자 전용) */
export const provisionChannel = (channelId: string) =>
  invoke("provisionChannel", { channelId });

/** 채널 라이브 시작 */
export const startChannel = (channelId: string) =>
  invoke("startChannel", { channelId });

/** 채널 라이브 종료 (admin can pass reason for force-stop) */
export const stopChannel = (channelId: string, reason?: string) =>
  invoke("stopChannel", { channelId, reason });

/** GCP 채널 상태 조회 (폴링용) */
export const getStatus = (
  channelId: string
): Promise<{
  streamingState: string;
  inputAttachments?: unknown;
  activeInput?: string;
  streamUrl?: string | null;
}> => invoke("getStatus", { channelId });

/** HLS 재생 URL 조회 */
export const getHLSUrl = (channelId: string) => invoke("getHLSUrl", { channelId });

/**
 * 저장된 RTMP URI를 OBS용 (서버 / 스트림 키)로 분리.
 * 예: rtmp://1.2.3.4:1935/live/abc123 → { server: "rtmp://1.2.3.4:1935/live", streamKey: "abc123" }
 */
export const parseRtmpUri = (
  uri: string | null | undefined
): { server: string; streamKey: string } | null => {
  if (!uri) return null;
  const match = uri.match(/^(rtmps?:\/\/[^/]+\/[^/]+)\/(.+)$/);
  if (!match) return null;
  return { server: match[1], streamKey: match[2] };
};
