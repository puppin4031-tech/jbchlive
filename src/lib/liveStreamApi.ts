import { supabase } from "@/integrations/supabase/client";

const invoke = async (action: string, params: Record<string, unknown> = {}) => {
  const cleanParams: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) cleanParams[k] = v;
  }
  const { data, error } = await supabase.functions.invoke("live-stream", {
    body: { action, ...cleanParams },
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      let message = "";
      try {
        const body = await context.clone().json();
        message = typeof body?.error === "string" ? body.error : "";
      } catch {
        // Response was not JSON; try plain text below.
      }
      if (!message) {
        try {
          const text = await context.clone().text();
          message = text || "";
        } catch {
          // Fall through to the original SDK error below.
        }
      }
      if (message) throw new Error(message);
    }
    throw error;
  }
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

/** 관리자용: 채널 전체 진단 (DB + GCP 채널/입력/최근 오퍼레이션) */
export type ChannelDiagnostic = {
  database: Record<string, unknown> | null;
  gcp: {
    location: string;
    channelId: string;
    inputId: string;
    channel: Record<string, unknown> & { error?: string };
    input: Record<string, unknown> & { error?: string };
    operations: Array<Record<string, unknown>>;
  };
};
export const diagnoseChannel = (channelId: string): Promise<ChannelDiagnostic> =>
  invoke("diagnoseChannel", { channelId });

/** 관리자용: STARTING 상태에서 강제 종료 (GCP 실패해도 DB만 오프라인 처리) */
export const forceStopStartingChannel = (channelId: string) =>
  invoke("forceStopStartingChannel", { channelId });

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

/** 장시간+저시청자 자동 종료 확인 프롬프트에 [계속 송출] 응답 */
export const confirmKeepalive = (channelId: string) =>
  invoke("confirmKeepalive", { channelId });

/** Broadcaster browser heartbeat (Layer 1 zombie stream defense) */
export const heartbeatBroadcaster = (channelId: string) =>
  invoke("heartbeatBroadcaster", { channelId });



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
