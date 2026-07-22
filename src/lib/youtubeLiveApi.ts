import { supabase } from "@/integrations/supabase/client";

async function invoke<T = unknown>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("youtube-live", {
    body: { action, ...body },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const ytStartOAuth = (channelId: string, redirectUri: string) =>
  invoke<{ authUrl: string }>("oauth_start", { channelId, redirectUri });

export const ytOAuthCallback = (code: string, state: string, redirectUri: string) =>
  invoke<{ ok: true; channelId: string; youtubeChannelTitle?: string }>("oauth_callback", {
    code,
    state,
    redirectUri,
  });

export const ytStatus = (channelId: string) =>
  invoke<{ youtube_connected?: boolean; youtube_channel_title?: string; youtube_channel_id?: string }>(
    "status",
    { channelId },
  );

export const ytDisconnect = (channelId: string) =>
  invoke<{ ok: true }>("disconnect", { channelId });

export interface CreateBroadcastResult {
  ok: true;
  broadcastId: string;
  streamId: string;
  rtmpUrl: string;
  streamKey: string;
  watchUrl: string;
  embedUrl: string;
  sessionId?: string;
}

export const ytCreateBroadcast = (channelId: string, title?: string, description?: string) =>
  invoke<CreateBroadcastResult>("create_broadcast", { channelId, title, description });

export const ytStopBroadcast = (channelId: string) =>
  invoke<{ ok: true }>("stop_broadcast", { channelId });
