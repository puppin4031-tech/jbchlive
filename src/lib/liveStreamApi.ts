import { supabase } from "@/integrations/supabase/client";

const invoke = async (action: string, params: Record<string, string | undefined> = {}) => {
  // Remove undefined values
  const cleanParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) cleanParams[k] = v;
  }
  const { data, error } = await supabase.functions.invoke("live-stream", {
    body: { action, ...cleanParams },
  });
  if (error) throw error;
  return data;
};

/** RTMP 입력 엔드포인트 생성 */
export const createInput = (inputId: string) =>
  invoke("createInput", { inputId });

/** 라이브 채널 생성 (입력과 연결) */
export const createChannel = (channelId: string, inputId: string) =>
  invoke("createChannel", { channelId, inputId });

/** 채널 라이브 시작 */
export const startChannel = (channelId: string) =>
  invoke("startChannel", { channelId });

/** 채널 라이브 종료 (자동 VOD 저장) */
export const stopChannel = (channelId: string, vodOptions?: { vodTitle?: string; vodCategory?: string; vodPreacher?: string }) =>
  invoke("stopChannel", { channelId, ...vodOptions });

/** 채널 상태 조회 */
export const getStatus = (channelId: string) =>
  invoke("getStatus", { channelId });

/** HLS 재생 URL 조회 */
export const getHLSUrl = (channelId: string) =>
  invoke("getHLSUrl", { channelId });
