// YouTube Live Streaming API integration for 주일말씀 broadcasts.
// Actions: oauth_start, oauth_callback, status, create_broadcast, stop_broadcast, disconnect
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLIENT_ID = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("YOUTUBE_OAUTH_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE);

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await client.auth.getUser();
  return data.user;
}

async function assertOwnsChannel(userId: string, channelId: string) {
  const { data, error } = await admin()
    .from("channels")
    .select("id, owner_id")
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== userId) throw new Error("Not channel owner");
}

async function exchangeCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error("OAuth exchange failed: " + JSON.stringify(json));
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Token refresh failed: " + JSON.stringify(json));
  return json as { access_token: string; expires_in: number };
}

async function getFreshAccessToken(channelId: string): Promise<string> {
  const db = admin();
  const { data: row, error } = await db
    .from("channel_youtube_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("YouTube not connected for this channel");
  const exp = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && exp - Date.now() > 60_000) return row.access_token;
  const t = await refreshAccessToken(row.refresh_token);
  const expiresAt = new Date(Date.now() + (t.expires_in - 30) * 1000).toISOString();
  await db.from("channel_youtube_tokens")
    .update({ access_token: t.access_token, access_token_expires_at: expiresAt })
    .eq("channel_id", channelId);
  return t.access_token;
}

async function ytFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`YouTube API [${res.status}]: ${text}`);
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return jsonResponse({ error: "YouTube OAuth not configured. Missing YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET" }, 500);
    }
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await req.clone().json().catch(() => ({}))).action;

    // oauth_start: build auth URL. Requires user auth + channelId.
    if (action === "oauth_start") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { channelId, redirectUri } = await req.json();
      if (!channelId || !redirectUri) return jsonResponse({ error: "channelId and redirectUri required" }, 400);
      await assertOwnsChannel(user.id, channelId);
      const state = btoa(JSON.stringify({ channelId, userId: user.id, ts: Date.now() }));
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", YT_SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);
      return jsonResponse({ authUrl: authUrl.toString() });
    }

    // oauth_callback: exchange code, store refresh token, fetch YT channel info
    if (action === "oauth_callback") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { code, state, redirectUri } = await req.json();
      if (!code || !state || !redirectUri) return jsonResponse({ error: "code, state, redirectUri required" }, 400);
      let parsed: { channelId: string; userId: string };
      try { parsed = JSON.parse(atob(state)); } catch { return jsonResponse({ error: "Invalid state" }, 400); }
      if (parsed.userId !== user.id) return jsonResponse({ error: "State mismatch" }, 403);
      await assertOwnsChannel(user.id, parsed.channelId);
      const tokens = await exchangeCode(code, redirectUri);
      if (!tokens.refresh_token) {
        return jsonResponse({ error: "No refresh token returned. Revoke previous consent at myaccount.google.com/permissions and retry." }, 400);
      }
      const expiresAt = new Date(Date.now() + (tokens.expires_in - 30) * 1000).toISOString();
      // Fetch YouTube channel identity
      const ytChan = await ytFetch("/channels?part=id,snippet&mine=true", tokens.access_token);
      const item = ytChan.items?.[0];
      const ytId = item?.id;
      const ytTitle = item?.snippet?.title;
      const db = admin();
      await db.from("channel_youtube_tokens").upsert({
        channel_id: parsed.channelId,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAt,
        scope: tokens.scope,
        connected_by: user.id,
      });
      await db.from("channels").update({
        youtube_connected: true,
        youtube_channel_id: ytId,
        youtube_channel_title: ytTitle,
      }).eq("id", parsed.channelId);
      return jsonResponse({ ok: true, channelId: parsed.channelId, youtubeChannelTitle: ytTitle });
    }

    // status: is connected?
    if (action === "status") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { channelId } = await req.json();
      await assertOwnsChannel(user.id, channelId);
      const { data } = await admin()
        .from("channels")
        .select("youtube_connected, youtube_channel_title, youtube_channel_id")
        .eq("id", channelId)
        .maybeSingle();
      return jsonResponse(data || {});
    }

    // disconnect
    if (action === "disconnect") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { channelId } = await req.json();
      await assertOwnsChannel(user.id, channelId);
      const db = admin();
      await db.from("channel_youtube_tokens").delete().eq("channel_id", channelId);
      await db.from("channels").update({
        youtube_connected: false,
        youtube_channel_id: null,
        youtube_channel_title: null,
      }).eq("id", channelId);
      return jsonResponse({ ok: true });
    }

    // create_broadcast: create liveBroadcast + liveStream + bind, return RTMP URL/key + watch URL
    if (action === "create_broadcast") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { channelId, title, description } = await req.json();
      await assertOwnsChannel(user.id, channelId);
      const accessToken = await getFreshAccessToken(channelId);
      const startISO = new Date(Date.now() + 60_000).toISOString();

      // 1) Create liveBroadcast (self-service defaults, auto start/stop)
      const broadcast = await ytFetch(
        "/liveBroadcasts?part=snippet,status,contentDetails",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            snippet: {
              title: title || "주일말씀",
              description: description || "",
              scheduledStartTime: startISO,
            },
            status: {
              privacyStatus: "public",
              selfDeclaredMadeForKids: false,
            },
            contentDetails: {
              enableAutoStart: true,
              enableAutoStop: true,
              enableDvr: true,
              enableEmbed: true,
              recordFromStart: true,
              monitorStream: { enableMonitorStream: false },
            },
          }),
        },
      );
      const broadcastId = broadcast.id as string;

      // 2) Create liveStream (RTMP, 720p variable)
      const stream = await ytFetch(
        "/liveStreams?part=snippet,cdn,contentDetails",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            snippet: { title: title || "주일말씀 stream" },
            cdn: {
              frameRate: "variable",
              ingestionType: "rtmp",
              resolution: "variable",
            },
            contentDetails: { isReusable: false },
          }),
        },
      );
      const streamId = stream.id as string;
      const ingestion = stream.cdn?.ingestionInfo || {};
      const rtmpUrl = ingestion.ingestionAddress || "";
      const streamKey = ingestion.streamName || "";

      // 3) Bind
      await ytFetch(
        `/liveBroadcasts/bind?part=id,contentDetails&id=${broadcastId}&streamId=${streamId}`,
        accessToken,
        { method: "POST" },
      );

      const watchUrl = `https://www.youtube.com/watch?v=${broadcastId}`;
      const embedUrl = `https://www.youtube.com/embed/${broadcastId}?autoplay=1`;

      // Persist
      const db = admin();
      const nowISO = new Date().toISOString();
      const { data: session } = await db
        .from("live_sessions")
        .insert({
          channel_id: channelId,
          started_at: nowISO,
          broadcast_type: "sunday_sermon",
          youtube_broadcast_id: broadcastId,
          youtube_video_id: broadcastId,
          youtube_watch_url: watchUrl,
        })
        .select()
        .single();
      await db.from("channels").update({
        is_live: true,
        live_started_at: nowISO,
        current_broadcast_type: "sunday_sermon",
        current_youtube_video_id: broadcastId,
        current_youtube_watch_url: watchUrl,
        youtube_last_broadcast_id: broadcastId,
        youtube_last_video_id: broadcastId,
        youtube_last_watch_url: watchUrl,
        gcp_last_error: null,
        stream_url: null,
      }).eq("id", channelId);

      return jsonResponse({
        ok: true,
        broadcastId,
        streamId,
        rtmpUrl,
        streamKey,
        watchUrl,
        embedUrl,
        sessionId: session?.id,
      });
    }

    // stop_broadcast: transition to complete, clear channel live state
    if (action === "stop_broadcast") {
      const user = await getUser(req);
      if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
      const { channelId } = await req.json();
      await assertOwnsChannel(user.id, channelId);
      const accessToken = await getFreshAccessToken(channelId);
      const db = admin();
      const { data: ch } = await db.from("channels")
        .select("current_youtube_video_id")
        .eq("id", channelId).maybeSingle();
      const bId = ch?.current_youtube_video_id;
      if (bId) {
        try {
          await ytFetch(
            `/liveBroadcasts/transition?part=status&broadcastStatus=complete&id=${bId}`,
            accessToken,
            { method: "POST" },
          );
        } catch (e) {
          console.warn("transition complete failed:", (e as Error).message);
        }
      }
      const nowISO = new Date().toISOString();
      await db.from("channels").update({
        is_live: false,
        current_broadcast_type: null,
        current_youtube_video_id: null,
        current_youtube_watch_url: null,
      }).eq("id", channelId);
      await db.from("live_sessions")
        .update({ ended_at: nowISO })
        .eq("channel_id", channelId)
        .is("ended_at", null);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("youtube-live error:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
