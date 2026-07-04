import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROJECT_ID = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID")!;
const LOCATION = Deno.env.get("GOOGLE_CLOUD_LOCATION")!;
const SERVICE_ACCOUNT_JSON = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON")!;

const BASE_URL = `https://livestream.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}`;

// --- Google Auth via Service Account JWT ---

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signInput = `${header}.${payload}`;

  // Normalize PEM: handle literal "\n" sequences (escaped in env vars), real newlines, CR, and any whitespace
  const pemBody = sa.private_key
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!pemBody) {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON: private_key is empty after cleanup");
  }
  let binaryKey: Uint8Array;
  try {
    binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  } catch (e) {
    throw new Error(
      `Failed to base64-decode private_key (length=${pemBody.length}). ` +
      `Check that GCP_SERVICE_ACCOUNT_JSON contains valid JSON with a proper PEM private_key.`
    );
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`GCP token error: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

async function gcpFetch(url: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GCP API error [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data;
}

// Poll an LRO operation until done (with timeout)
async function waitForOperation(opName: string, timeoutMs = 120_000): Promise<any> {
  const url = `https://livestream.googleapis.com/v1/${opName}`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const op = await gcpFetch(url);
    if (op.done) {
      if (op.error) {
        throw new Error(`Operation failed: ${JSON.stringify(op.error)}`);
      }
      return op.response || op;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Operation timed out: ${opName}`);
}

// --- Auth helpers ---

async function verifyUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) throw new Error("Unauthorized");

  const userId = claimsData.claims.sub as string;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: roles } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");

  const isAdmin = roles && roles.length > 0;
  return { id: userId, isAdmin, serviceClient };
}

async function verifyChannelAccess(
  user: { id: string; isAdmin: boolean; serviceClient: ReturnType<typeof createClient> },
  channelId: string
) {
  if (user.isAdmin) return;

  const { data: channel } = await user.serviceClient
    .from("channels")
    .select("owner_id")
    .eq("id", channelId)
    .single();

  if (!channel || channel.owner_id !== user.id) {
    throw new Error("Forbidden: not channel owner or admin");
  }
}

// --- GCP Resource ID derivation ---
// Legacy deterministic IDs — kept as fallback for channels provisioned before
// the "Safe Reset" refactor, whose current live-pipeline IDs are stored in DB.
// GCP IDs: lowercase letters, digits, hyphens, max 63 chars, must start with letter.
function gcpResourceId(channelUuid: string, kind: "input" | "channel"): string {
  const short = channelUuid.replace(/-/g, "").slice(0, 24);
  return `${kind === "input" ? "in" : "ch"}-${short}`;
}

// New unique-per-provision IDs. Timestamp appended so re-provision never
// collides with a still-existing GCP resource (409 Conflict) and cannot
// overwrite previous output manifests in the storage bucket.
function newGcpResourceId(channelUuid: string, kind: "input" | "channel", ts: number): string {
  const short = channelUuid.replace(/-/g, "").slice(0, 16);
  const suffix = ts.toString(36);
  return `${kind === "input" ? "in" : "ch"}-${short}-${suffix}`;
}

// Resolve the effective GCP channel/input IDs for a DB channel row.
// Prefers the values persisted at provision time; falls back to the legacy
// deterministic scheme for rows provisioned before this refactor.
async function resolveGcpIds(
  serviceClient: ReturnType<typeof createClient>,
  channelUuid: string,
): Promise<{ inputId: string; gcpChannelId: string }> {
  const { data } = await serviceClient
    .from("channels")
    .select("gcp_input_id, gcp_channel_id")
    .eq("id", channelUuid)
    .maybeSingle();
  return {
    inputId: (data?.gcp_input_id as string | null) ?? gcpResourceId(channelUuid, "input"),
    gcpChannelId: (data?.gcp_channel_id as string | null) ?? gcpResourceId(channelUuid, "channel"),
  };
}

// --- GCP API operations ---

async function createInput(inputId: string) {
  const url = `${BASE_URL}/inputs?inputId=${inputId}`;
  const op = await gcpFetch(url, {
    method: "POST",
    body: JSON.stringify({
      type: "RTMP_PUSH",
      securityRules: { ipRanges: ["0.0.0.0/0"] },
    }),
  });
  // Wait for input creation to complete
  await waitForOperation(op.name);
  // Fetch the created input to get the RTMP URI
  return getInput(inputId);
}

async function getInput(inputId: string) {
  return gcpFetch(`${BASE_URL}/inputs/${inputId}`);
}

async function deleteInput(inputId: string) {
  const op = await gcpFetch(`${BASE_URL}/inputs/${inputId}`, { method: "DELETE" });
  if (op.name) {
    await waitForOperation(op.name).catch((e) =>
      console.error("deleteInput wait failed", e)
    );
  }
}

async function createChannel(channelId: string, inputId: string, outputUri: string) {
  const inputName = `projects/${PROJECT_ID}/locations/${LOCATION}/inputs/${inputId}`;
  const url = `${BASE_URL}/channels?channelId=${channelId}`;
  const op = await gcpFetch(url, {
    method: "POST",
    body: JSON.stringify({
      inputAttachments: [{ key: "primary", input: inputName }],
      output: { uri: outputUri },
      elementaryStreams: [
        {
          key: "video-stream",
          videoStream: {
            h264: {
              profile: "main",
              bitrateBps: 1500000,
              frameRate: 24,
              widthPixels: 1280,
              heightPixels: 720,
            },


          },
        },
        {
          key: "audio-stream",
          audioStream: {
            codec: "aac",
            bitrateBps: 128000,
            channelCount: 2,
            sampleRateHertz: 48000,
          },
        },
      ],
      muxStreams: [
        {
          key: "mux-video",
          container: "fmp4",
          elementaryStreams: ["video-stream"],
          segmentSettings: { segmentDuration: "6s" },
        },
        {
          key: "mux-audio",
          container: "fmp4",
          elementaryStreams: ["audio-stream"],
          segmentSettings: { segmentDuration: "6s" },
        },
      ],
      manifests: [
        {
          fileName: "manifest.m3u8",
          type: "HLS",
          muxStreams: ["mux-video", "mux-audio"],
          maxSegmentCount: 5,
          segmentKeepDuration: "60s",
        },
      ],
    }),
  });
  await waitForOperation(op.name);
  return getChannelGCP(channelId);
}

async function getChannelGCP(channelId: string) {
  return gcpFetch(`${BASE_URL}/channels/${channelId}`);
}

async function startChannelGCP(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:start`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function stopChannelGCP(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:stop`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function deleteChannelGCP(channelId: string) {
  const op = await gcpFetch(`${BASE_URL}/channels/${channelId}`, { method: "DELETE" });
  if (op.name) {
    await waitForOperation(op.name).catch((e) =>
      console.error("deleteChannel wait failed", e)
    );
  }
}

function gsToHttps(uri: string): string {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  return m ? `https://storage.googleapis.com/${m[1]}/${m[2]}` : uri;
}

async function buildHlsHttpsUrl(gcpChannelId: string): Promise<string | null> {
  try {
    const ch = await getChannelGCP(gcpChannelId);
    const fileName = ch.manifests?.[0]?.fileName ?? "manifest.m3u8";
    const outputUri: string = ch.output?.uri ?? "";
    if (!outputUri.startsWith("gs://")) return null;
    const base = outputUri.endsWith("/") ? outputUri : `${outputUri}/`;
    return gsToHttps(`${base}${fileName}`);
  } catch {
    return null;
  }
}

async function getHLSUrl(channelId: string) {
  const channel = await getChannelGCP(channelId);
  const manifest = channel.manifests?.[0];
  const outputUri = channel.output?.uri || "";
  const base = outputUri.endsWith("/") ? outputUri : `${outputUri}/`;
  const rawUrl = `${base}${manifest?.fileName || "manifest.m3u8"}`;
  const hlsUrl = gsToHttps(rawUrl);
  return {
    hlsUrl,
    streamingState: channel.streamingState,
    inputUri: channel.inputAttachments?.[0]?.input,
  };
}

// --- High-level orchestrations ---

/**
 * Safe Reset provisioning.
 *
 * On every call this function:
 *   1. Reads any previously-provisioned GCP Input/Channel IDs from the DB and
 *      best-effort DELETES them on GCP. 404/403/NOT_FOUND/PERMISSION_DENIED
 *      are silently ignored (resource already gone or lost admin permission).
 *      Never deletes a channel that is currently live — admin must stop first.
 *   2. Generates BRAND-NEW timestamp-suffixed IDs for both the Input and the
 *      Channel, so there is no possibility of a 409 Conflict against a
 *      still-lingering resource.
 *   3. Uses a timestamped GCS output folder so a new live session cannot
 *      overwrite manifest/segment files from a previous session.
 *   4. Creates the Input, then the Channel (with separated video/audio
 *      mux_streams in an fmp4 container — fixes prior INVALID_ARGUMENT).
 *   5. ONLY after both GCP resources are fully created, atomically writes
 *      the new IDs + RTMP URI + output URI to the channels row.
 */
async function safeDeleteInput(inputId: string): Promise<void> {
  try {
    await deleteInput(inputId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404") || msg.includes("NOT_FOUND") ||
        msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      return;
    }
    console.error("safeDeleteInput non-fatal:", msg);
  }
}

async function safeDeleteChannel(gcpChannelId: string): Promise<void> {
  try {
    // Guard against wiping a live channel
    const existing = await getChannelGCP(gcpChannelId).catch(() => null);
    if (existing) {
      const state = existing.streamingState;
      if (state && state !== "STOPPED" && state !== "STREAMING_STATE_UNSPECIFIED") {
        throw new Error(
          `Channel is currently ${state}. Stop the live broadcast before reprovisioning.`,
        );
      }
    }
    await deleteChannelGCP(gcpChannelId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Channel is currently")) throw e;
    if (msg.includes("404") || msg.includes("NOT_FOUND") ||
        msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      return;
    }
    console.error("safeDeleteChannel non-fatal:", msg);
  }
}

async function provisionChannel(
  serviceClient: ReturnType<typeof createClient>,
  channelUuid: string,
) {
  // ---- Step 0: read existing IDs (may be null for first-time provisioning) ----
  const { data: existing } = await serviceClient
    .from("channels")
    .select("gcp_input_id, gcp_channel_id")
    .eq("id", channelUuid)
    .maybeSingle();

  const oldInputId = (existing?.gcp_input_id as string | null) ??
    gcpResourceId(channelUuid, "input"); // legacy fallback
  const oldChannelId = (existing?.gcp_channel_id as string | null) ??
    gcpResourceId(channelUuid, "channel");

  // ---- Step 1: CLEANUP FIRST — delete old channel then input ----
  // Order matters: channel references input, so channel first.
  await safeDeleteChannel(oldChannelId);
  await safeDeleteInput(oldInputId);

  // ---- Step 2: generate brand-new unique IDs and output path ----
  const ts = Date.now();
  const newInputId = newGcpResourceId(channelUuid, "input", ts);
  const newChannelId = newGcpResourceId(channelUuid, "channel", ts);
  const newOutputUri = `gs://${PROJECT_ID}-live-output/${channelUuid}/${ts}/`;

  let inputCreated = false;
  try {
    // ---- Step 3: create Input ----
    const input = await createInput(newInputId);
    inputCreated = true;
    if (!input?.uri) {
      throw new Error("Input created but no RTMP URI returned");
    }
    const inputUri = input.uri as string;

    // ---- Step 4: create Channel (fmp4, separate video/audio mux streams) ----
    await createChannel(newChannelId, newInputId, newOutputUri);

    // ---- Step 5: atomic DB update AFTER both GCP resources exist ----
    const { error: dbErr } = await serviceClient
      .from("channels")
      .update({
        gcp_input_id: newInputId,
        gcp_channel_id: newChannelId,
        gcp_input_uri: inputUri,
        gcp_output_uri: newOutputUri,
        gcp_provisioned_at: new Date().toISOString(),
        gcp_last_error: null,
        stream_url: null,
      })
      .eq("id", channelUuid);
    if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

    return {
      gcp_input_id: newInputId,
      gcp_channel_id: newChannelId,
      gcp_input_uri: inputUri,
      gcp_output_uri: newOutputUri,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Roll back any half-created GCP resources so we don't leak quota.
    if (inputCreated) {
      await safeDeleteInput(newInputId);
    }
    await safeDeleteChannel(newChannelId);
    await serviceClient
      .from("channels")
      .update({ gcp_last_error: msg.slice(0, 1000) })
      .eq("id", channelUuid);
    throw err;
  }
}

// --- Live Session helpers (history & viewer stats) ---
// IMPORTANT: These run AFTER the existing start/stop logic succeeds. They never
// throw outward so a session-recording failure cannot break the broadcaster
// critical path.

async function openLiveSession(
  serviceClient: ReturnType<typeof createClient>,
  channelId: string,
) {
  try {
    // If a session is already open for this channel, do nothing (idempotent)
    const { data: existing } = await serviceClient
      .from("live_sessions")
      .select("id")
      .eq("channel_id", channelId)
      .is("ended_at", null)
      .maybeSingle();
    if (existing) return existing.id as string;

    const { data: ch } = await serviceClient
      .from("channels")
      .select("name")
      .eq("id", channelId)
      .single();

    const now = new Date();
    const title = `${ch?.name ?? "라이브"} - ${now.toISOString().slice(0, 16).replace("T", " ")}`;

    const { data: inserted } = await serviceClient
      .from("live_sessions")
      .insert({ channel_id: channelId, title, started_at: now.toISOString() })
      .select("id")
      .single();
    return inserted?.id as string | undefined;
  } catch (e) {
    console.error("openLiveSession failed:", e);
  }
}

async function closeLiveSession(
  serviceClient: ReturnType<typeof createClient>,
  channelId: string,
  endReason: string,
) {
  try {
    const { data: session } = await serviceClient
      .from("live_sessions")
      .select("id, started_at")
      .eq("channel_id", channelId)
      .is("ended_at", null)
      .maybeSingle();
    if (!session) return;

    // Aggregate viewer samples
    const { data: samples } = await serviceClient
      .from("live_viewer_samples")
      .select("viewer_count")
      .eq("session_id", session.id);

    let peak = 0;
    let avg = 0;
    if (samples && samples.length > 0) {
      const counts = samples.map((s: { viewer_count: number }) => s.viewer_count);
      peak = Math.max(...counts);
      avg = counts.reduce((a: number, b: number) => a + b, 0) / counts.length;
    }

    const now = new Date();
    const duration = Math.max(
      0,
      Math.round((now.getTime() - new Date(session.started_at).getTime()) / 1000),
    );

    await serviceClient
      .from("live_sessions")
      .update({
        ended_at: now.toISOString(),
        duration_seconds: duration,
        peak_viewers: peak,
        avg_viewers: Number(avg.toFixed(2)),
        end_reason: endReason,
      })
      .eq("id", session.id);
  } catch (e) {
    console.error("closeLiveSession failed:", e);
  }
}

async function sampleViewerCounts(serviceClient: ReturnType<typeof createClient>) {
  // Heartbeat interval is 5min — cleanup stale presence >12 minutes (2 missed beats)
  const staleCutoff = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  await serviceClient.from("viewer_presence").delete().lt("last_seen_at", staleCutoff);

  const { data: liveChannels } = await serviceClient
    .from("channels")
    .select("id")
    .eq("is_live", true);

  // Count viewers with heartbeats in the last 6min (5min interval + 1min grace)
  const recentCutoff = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const samples: { session_id: string; viewer_count: number }[] = [];

  for (const ch of liveChannels ?? []) {
    const { data: session } = await serviceClient
      .from("live_sessions")
      .select("id")
      .eq("channel_id", ch.id)
      .is("ended_at", null)
      .maybeSingle();
    if (!session) continue;

    const { count } = await serviceClient
      .from("viewer_presence")
      .select("viewer_key", { count: "exact", head: true })
      .eq("channel_id", ch.id)
      .gte("last_seen_at", recentCutoff);

    samples.push({ session_id: session.id, viewer_count: count ?? 0 });
  }

  if (samples.length > 0) {
    await serviceClient.from("live_viewer_samples").insert(samples);
  }
  return samples.length;
}

// --- In-memory Rate Limiter ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowSec: number }> = {
  createInput: { max: 3, windowSec: 60 },
  createChannel: { max: 3, windowSec: 60 },
  provisionChannel: { max: 3, windowSec: 60 },
  startChannel: { max: 5, windowSec: 60 },
  stopChannel: { max: 5, windowSec: 60 },
  getStatus: { max: 60, windowSec: 60 },
  getHLSUrl: { max: 30, windowSec: 60 },
  confirmKeepalive: { max: 10, windowSec: 60 },
  heartbeatBroadcaster: { max: 10, windowSec: 60 },


  viewerHeartbeat: { max: 4, windowSec: 60 },
  autoStopIdleChannels: { max: 30, windowSec: 60 },
  scheduledStartChannels: { max: 30, windowSec: 60 },
  scheduledStopChannels: { max: 30, windowSec: 60 },
  sampleLiveViewers: { max: 30, windowSec: 60 },
};

// Cron-triggered actions: bypass user auth, require x-cron-secret header
const CRON_ACTIONS = new Set([
  "autoStopIdleChannels",
  "scheduledStartChannels",
  "scheduledStopChannels",
  "sampleLiveViewers",
]);

// Public actions: no auth required (used by all viewers, including anonymous)
const PUBLIC_ACTIONS = new Set(["viewerHeartbeat"]);

function checkRateLimit(userId: string, action: string) {
  const limit = RATE_LIMITS[action] || { max: 10, windowSec: 60 };
  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + limit.windowSec * 1000 });
    return;
  }

  if (entry.count >= limit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new Error(`Rate limit exceeded. Retry after ${retryAfter}s`);
  }

  entry.count++;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // === Cron-triggered actions ===
    if (CRON_ACTIONS.has(action)) {
      const cronSecret = req.headers.get("x-cron-secret");
      const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!cronSecret || cronSecret !== expected) {
        throw new Error("Unauthorized");
      }
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Helper: stop a single channel (idempotent)
      const stopOne = async (channelId: string, reason?: string, endReason: string = "auto") => {
        const { gcpChannelId } = await resolveGcpIds(serviceClient, channelId);
        try {
          await stopChannelGCP(gcpChannelId);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("FAILED_PRECONDITION") && !msg.includes("not running")) {
            throw e;
          }
        }
        await serviceClient
          .from("channels")
          .update({
            is_live: false,
            gcp_channel_state: "STOPPED",
            stream_url: null,
            current_viewers: 0,
            low_viewer_since: null,
            broadcaster_last_seen_at: null,
            ...(reason ? { gcp_last_error: reason } : {}),
          })
          .eq("id", channelId);
        // History: close session (never throws)
        await closeLiveSession(serviceClient, channelId, endReason);
      };


      if (action === "autoStopIdleChannels") {
        // (A) Stop channels marked live with no RTMP input (AWAITING_INPUT) > auto_stop_idle_minutes.
        // (B) Long-running + low-viewer keepalive prompt + auto-stop on no response.
        // (C) OBS disconnect detection: once RTMP has streamed, dropping to AWAITING_INPUT
        //     triggers a 1-minute (configurable) grace then auto-stop.
        const { data: liveChannels } = await serviceClient
          .from("channels")
          .select(
            "id, owner_id, name, live_started_at, stream_url, auto_stop_idle_minutes, auto_stop_max_minutes, auto_stop_disconnect_minutes, rtmp_disconnected_at, low_viewer_threshold, keepalive_grace_minutes, keepalive_prompt_sent_at, keepalive_confirmed_at, peak_viewers, low_viewer_since",
          )
          .eq("is_live", true);

        // Hard policy caps (Layer 3 watchdog): non-configurable per requirement
        const HARD_MAX_MINUTES = 300;         // 5 hours absolute cap
        const LOW_VIEWER_MAX_MINUTES = 50;    // <= threshold for 50 min → force stop
        const HARD_LOW_VIEWER_THRESHOLD = 2;
        const BROADCASTER_STALE_MINUTES = 3;  // Layer 1 heartbeat-based

        const stopped: string[] = [];
        const prompted: string[] = [];
        const disconnected: string[] = [];
        const nowMs = Date.now();
        const presenceCutoff = new Date(nowMs - 2 * 60 * 1000).toISOString();

        for (const ch of liveChannels ?? []) {
          const idleMin = ch.auto_stop_idle_minutes ?? 15;
          const startedAt = ch.live_started_at ? new Date(ch.live_started_at).getTime() : 0;
          const elapsedMin = (nowMs - startedAt) / 60000;

          // Fetch current GCP state once per channel
          const { gcpChannelId } = await resolveGcpIds(serviceClient, ch.id);
          const gcpCh = await getChannelGCP(gcpChannelId).catch(() => null);
          const state = gcpCh?.streamingState;

          // === Sync live viewer stats to channels row (every cron tick) ===
          const { count: viewerCountRaw } = await serviceClient
            .from("viewer_presence")
            .select("viewer_key", { count: "exact", head: true })
            .eq("channel_id", ch.id)
            .gt("last_seen_at", presenceCutoff);
          const viewerCount = viewerCountRaw ?? 0;
          const newPeak = Math.max(ch.peak_viewers ?? 0, viewerCount);
          const avgSec = startedAt > 0 ? Math.floor((nowMs - startedAt) / 1000) : 0;

          // Track low_viewer_since window
          const lowActive = viewerCount <= HARD_LOW_VIEWER_THRESHOLD;
          const prevLowSince = ch.low_viewer_since ? new Date(ch.low_viewer_since).getTime() : 0;
          const nextLowSince = lowActive
            ? (prevLowSince > 0 ? prevLowSince : nowMs)
            : 0;

          await serviceClient
            .from("channels")
            .update({
              current_viewers: viewerCount,
              peak_viewers: newPeak,
              avg_watch_seconds: avgSec,
              low_viewer_since: nextLowSince > 0 ? new Date(nextLowSince).toISOString() : null,
            })
            .eq("id", ch.id);

          // === Layer 3.a — Hard 5h cap: unconditional stop ===
          if (elapsedMin >= HARD_MAX_MINUTES) {
            try {
              await stopOne(
                ch.id,
                `자동 종료: 최대 방송 시간 ${HARD_MAX_MINUTES}분 초과`,
                "auto_max_duration",
              );
              stopped.push(ch.id);
            } catch (e) {
              console.error("autoStop(hard-cap) error for", ch.id, e);
            }
            continue;
          }

          // === Layer 3.b — Low viewers ≥ 50 min: unconditional stop ===
          if (lowActive && prevLowSince > 0 && (nowMs - prevLowSince) / 60000 >= LOW_VIEWER_MAX_MINUTES) {
            try {
              await stopOne(
                ch.id,
                `자동 종료: 시청자 ${HARD_LOW_VIEWER_THRESHOLD}명 이하 상태 ${LOW_VIEWER_MAX_MINUTES}분 지속`,
                "auto_low_viewer",
              );
              stopped.push(ch.id);
            } catch (e) {
              console.error("autoStop(low-viewer) error for", ch.id, e);
            }
            continue;
          }

          // === Layer 1 — Broadcaster browser heartbeat stale AND no RTMP input ===
          // Safe: never kills a channel that is actively receiving RTMP.
          const bLastSeen = (ch as { broadcaster_last_seen_at?: string | null })
            .broadcaster_last_seen_at;
          const bLastSeenMs = bLastSeen ? new Date(bLastSeen).getTime() : 0;
          if (
            bLastSeenMs > 0 &&
            (nowMs - bLastSeenMs) / 60000 >= BROADCASTER_STALE_MINUTES &&
            !ch.stream_url &&
            state !== "STREAMING"
          ) {
            try {
              await stopOne(
                ch.id,
                `자동 종료: 송출자 브라우저 ${BROADCASTER_STALE_MINUTES}분 이상 미접속 + RTMP 미수신`,
                "auto_broadcaster_absent",
              );
              stopped.push(ch.id);
            } catch (e) {
              console.error("autoStop(broadcaster-absent) error for", ch.id, e);
            }
            continue;
          }

          // --- (C) OBS disconnect fast-path ---
          const hadStream = !!ch.stream_url;
          const disconnectMin = ch.auto_stop_disconnect_minutes ?? 1;
          const isAwaiting = state === "AWAITING_INPUT" || state === "PENDING";
          const disconnectedAtMs = ch.rtmp_disconnected_at
            ? new Date(ch.rtmp_disconnected_at).getTime()
            : 0;

          if (hadStream && state === "STREAMING" && disconnectedAtMs > 0) {
            await serviceClient
              .from("channels")
              .update({ rtmp_disconnected_at: null })
              .eq("id", ch.id);
          } else if (hadStream && isAwaiting && disconnectedAtMs === 0) {
            await serviceClient
              .from("channels")
              .update({ rtmp_disconnected_at: new Date().toISOString() })
              .eq("id", ch.id);
            if (ch.owner_id) {
              await serviceClient.from("notifications").insert({
                user_id: ch.owner_id,
                type: "live_disconnect_warning",
                title: "OBS 연결이 끊겼습니다",
                body: `${disconnectMin}분 내 재연결되지 않으면 라이브가 자동 종료됩니다.`,
                link: "/my-channel",
                related_id: ch.id,
              });
            }
            disconnected.push(ch.id);
            continue;
          } else if (hadStream && isAwaiting && disconnectedAtMs > 0) {
            if ((nowMs - disconnectedAtMs) / 60000 >= disconnectMin) {
              try {
                await stopOne(
                  ch.id,
                  "OBS 연결 끊김으로 자동 종료",
                  "auto_disconnect",
                );
                stopped.push(ch.id);
              } catch (e) {
                console.error("autoStop(disconnect) error for", ch.id, e);
              }
              continue;
            }
          }

          // --- (A) RTMP-idle fallback (never-connected case) ---
          let didIdleStop = false;
          if (elapsedMin >= idleMin) {
            try {
              if (state === "AWAITING_INPUT" || state === "PENDING" || !state) {
                await stopOne(
                  ch.id,
                  `자동 종료: ${idleMin}분간 RTMP 입력 없음 (상태: ${state ?? "UNKNOWN"})`,
                  "auto_idle",
                );
                stopped.push(ch.id);
                didIdleStop = true;
              }
            } catch (e) {
              console.error("autoStop(idle) error for", ch.id, e);
            }
          }
          if (didIdleStop) continue;

          // --- (B) Legacy keepalive prompt path (kept as soft warning before hard caps) ---
          const maxMin = ch.auto_stop_max_minutes ?? 180;
          const graceMin = ch.keepalive_grace_minutes ?? 10;
          const threshold = ch.low_viewer_threshold ?? 2;
          const confirmedAt = ch.keepalive_confirmed_at
            ? new Date(ch.keepalive_confirmed_at).getTime()
            : 0;
          const effectiveStart = Math.max(startedAt, confirmedAt);
          const effectiveElapsedMin = (nowMs - effectiveStart) / 60000;
          if (effectiveElapsedMin < maxMin) continue;
          if (viewerCount > threshold) continue;

          const promptSentAt = ch.keepalive_prompt_sent_at
            ? new Date(ch.keepalive_prompt_sent_at).getTime()
            : 0;
          const promptActive = promptSentAt > confirmedAt;

          if (!promptActive) {
            if (ch.owner_id) {
              await serviceClient.from("notifications").insert({
                user_id: ch.owner_id,
                type: "live_keepalive_prompt",
                title: "라이브 계속 진행하시겠습니까?",
                body: `${Math.floor(effectiveElapsedMin)}분째 송출 중이며 시청자가 거의 없습니다. ${graceMin}분 내 응답이 없으면 자동 종료됩니다.`,
                link: "/my-channel",
                related_id: ch.id,
              });
            }
            await serviceClient
              .from("channels")
              .update({ keepalive_prompt_sent_at: new Date().toISOString() })
              .eq("id", ch.id);
            prompted.push(ch.id);
          } else if ((nowMs - promptSentAt) / 60000 >= graceMin) {
            try {
              await stopOne(
                ch.id,
                `${graceMin}분간 응답 없음으로 자동 종료 (저시청 + 장시간 송출)`,
                "auto_unattended",
              );
              stopped.push(ch.id);
            } catch (e) {
              console.error("autoStop(unattended) error for", ch.id, e);
            }
          }
        }

        return new Response(JSON.stringify({ stopped, prompted, disconnected }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      if (action === "scheduledStartChannels") {
        const nowIso = new Date().toISOString();
        const { data: toStart } = await serviceClient
          .from("channels")
          .select("id, name, gcp_input_uri, scheduled_start_at")
          .eq("is_live", false)
          .eq("is_approved", true)
          .eq("is_suspended", false)
          .not("scheduled_start_at", "is", null)
          .lte("scheduled_start_at", nowIso);

        const started: string[] = [];
        const failed: string[] = [];
        for (const ch of toStart ?? []) {
          // Clear schedule first to prevent retry loop
          await serviceClient
            .from("channels")
            .update({ scheduled_start_at: null })
            .eq("id", ch.id);

          if (!ch.gcp_input_uri) {
            await serviceClient
              .from("channels")
              .update({ gcp_last_error: "예약 시작 실패: GCP 미프로비저닝" })
              .eq("id", ch.id);
            failed.push(ch.id);
            continue;
          }
          try {
            const gcpChannelId = gcpResourceId(ch.id, "channel");
            await startChannelGCP(gcpChannelId);
            await serviceClient
              .from("channels")
              .update({
                is_live: true,
                live_started_at: new Date().toISOString(),
                gcp_channel_state: "STARTING",
                stream_url: null,
                gcp_last_error: null,
              })
              .eq("id", ch.id);
            // History: open session (never throws)
            await openLiveSession(serviceClient, ch.id);
            started.push(ch.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await serviceClient
              .from("channels")
              .update({ gcp_last_error: `예약 시작 실패: ${msg.slice(0, 200)}` })
              .eq("id", ch.id);
            failed.push(ch.id);
          }
        }
        return new Response(JSON.stringify({ started, failed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "scheduledStopChannels") {
        const nowIso = new Date().toISOString();
        const { data: toStop } = await serviceClient
          .from("channels")
          .select("id, scheduled_end_at")
          .eq("is_live", true)
          .not("scheduled_end_at", "is", null)
          .lte("scheduled_end_at", nowIso);

        const stopped: string[] = [];
        for (const ch of toStop ?? []) {
          await serviceClient
            .from("channels")
            .update({ scheduled_end_at: null })
            .eq("id", ch.id);
          try {
            await stopOne(ch.id, undefined, "scheduled");
            stopped.push(ch.id);
          } catch (e) {
            console.error("scheduledStop error for", ch.id, e);
          }
        }
        return new Response(JSON.stringify({ stopped }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "sampleLiveViewers") {
        const sampled = await sampleViewerCounts(serviceClient);
        return new Response(JSON.stringify({ sampled }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === Public actions (no auth) ===
    if (PUBLIC_ACTIONS.has(action)) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      if (action === "viewerHeartbeat") {
        const { channelId: cid, viewerKey } = body as { channelId?: string; viewerKey?: string };
        const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!cid || !UUID.test(cid)) throw new Error("Invalid channelId");
        if (!viewerKey || typeof viewerKey !== "string" || viewerKey.length < 8 || viewerKey.length > 64) {
          throw new Error("Invalid viewerKey");
        }
        // Per-viewer rate limit (4/min)
        checkRateLimit(viewerKey, "viewerHeartbeat");

        await serviceClient.from("viewer_presence").upsert(
          { channel_id: cid, viewer_key: viewerKey, last_seen_at: new Date().toISOString() },
          { onConflict: "channel_id,viewer_key" },
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === Authenticated user actions ===
    const authHeader = req.headers.get("authorization");
    const user = await verifyUser(authHeader);

    const { channelId, reason } = body;

    // Validate IDs
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ACTION_REGEX = /^[a-zA-Z0-9_-]{1,50}$/;
    if (channelId && !UUID_REGEX.test(channelId)) {
      throw new Error("Invalid channelId format (must be UUID)");
    }
    if (action && !ACTION_REGEX.test(action)) throw new Error("Invalid action format");
    checkRateLimit(user.id, action);

    // provisionChannel: admin only
    if (action === "provisionChannel" && !user.isAdmin) {
      throw new Error("Forbidden: admin only");
    }

    // Channel-scoped actions: owner or admin
    const channelActions = [
      "startChannel",
      "stopChannel",
      "getStatus",
      "getHLSUrl",
      "provisionChannel",
      "heartbeatBroadcaster",
    ];

    if (channelActions.includes(action) && channelId) {
      await verifyChannelAccess(user, channelId);
    }

    let result: unknown;

    switch (action) {
      case "provisionChannel": {
        if (!channelId) throw new Error("channelId required");
        result = await provisionChannel(user.serviceClient, channelId);
        break;
      }

      case "startChannel": {
        if (!channelId) throw new Error("channelId required");
        // Auto-provision if not yet done
        const { data: ch } = await user.serviceClient
          .from("channels")
          .select("gcp_input_uri")
          .eq("id", channelId)
          .single();
        if (!ch?.gcp_input_uri) {
          if (!user.isAdmin) {
            throw new Error("Channel not provisioned. Contact administrator.");
          }
          await provisionChannel(user.serviceClient, channelId);
        }
        const gcpChannelId = gcpResourceId(channelId, "channel");
        result = await startChannelGCP(gcpChannelId);
        await user.serviceClient
          .from("channels")
          .update({
            is_live: true,
            live_started_at: new Date().toISOString(),
            gcp_channel_state: "STARTING",
            stream_url: null,
            current_viewers: 0,
            peak_viewers: 0,
            avg_watch_seconds: 0,
            low_viewer_since: null,
            broadcaster_last_seen_at: new Date().toISOString(),
          })
          .eq("id", channelId);

        // History: open session (never throws)
        await openLiveSession(user.serviceClient, channelId);
        result = { ...(result as object), streamUrl: null };
        break;
      }

      case "stopChannel": {
        if (!channelId) throw new Error("channelId required");
        const gcpChannelId = gcpResourceId(channelId, "channel");

        try {
          result = await stopChannelGCP(gcpChannelId);
        } catch (e) {
          // Idempotent: already stopped is fine
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("FAILED_PRECONDITION") && !msg.includes("not running")) {
            throw e;
          }
          result = { alreadyStopped: true };
        }

        const forceReason = user.isAdmin && typeof reason === "string" && reason.trim()
          ? `관리자 강제 종료: ${reason.trim().slice(0, 200)}`
          : null;

        await user.serviceClient
          .from("channels")
          .update({
            is_live: false,
            gcp_channel_state: "STOPPED",
            stream_url: null,
            current_viewers: 0,
            low_viewer_since: null,
            broadcaster_last_seen_at: null,
            ...(forceReason ? { gcp_last_error: forceReason } : {}),
          })
          .eq("id", channelId);

        // History: close session (never throws)
        await closeLiveSession(
          user.serviceClient,
          channelId,
          user.isAdmin && typeof reason === "string" && reason.trim() ? "admin_forced" : "manual",
        );

        // No auto-VOD: live manifest URL is ephemeral and would 404 after stop.
        break;
      }

      case "heartbeatBroadcaster": {
        if (!channelId) throw new Error("channelId required");
        await user.serviceClient
          .from("channels")
          .update({ broadcaster_last_seen_at: new Date().toISOString() })
          .eq("id", channelId);
        result = { ok: true };
        break;
      }


      case "getStatus": {
        if (!channelId) throw new Error("channelId required");
        const gcpChannelId = gcpResourceId(channelId, "channel");
        const gcpCh = await getChannelGCP(gcpChannelId);
        const state = gcpCh.streamingState || "UNKNOWN";

        // Idempotent stream_url backfill: if channel is live but stream_url missing, populate it
        const { data: dbCh } = await user.serviceClient
          .from("channels")
          .select("is_live, stream_url")
          .eq("id", channelId)
          .single();

        let streamUrl = dbCh?.stream_url ?? null;
        if (state === "STREAMING") {
          streamUrl = streamUrl ?? await buildHlsHttpsUrl(gcpChannelId);
        } else {
          streamUrl = null;
        }

        if (dbCh?.is_live && state === "STREAMING" && !streamUrl) {
          streamUrl = await buildHlsHttpsUrl(gcpChannelId);
        }

        await user.serviceClient
          .from("channels")
          .update({
            gcp_channel_state: state,
            stream_url: dbCh?.is_live && state === "STREAMING" ? streamUrl : null,
          })
          .eq("id", channelId);

        result = {
          streamingState: state,
          inputAttachments: gcpCh.inputAttachments,
          activeInput: gcpCh.activeInput,
          streamUrl,
        };
        break;
      }

      case "getHLSUrl": {
        if (!channelId) throw new Error("channelId required");
        const gcpChannelId = gcpResourceId(channelId, "channel");
        result = await getHLSUrl(gcpChannelId);
        break;
      }

      case "confirmKeepalive": {
        if (!channelId) throw new Error("channelId required");
        await verifyChannelAccess(user, channelId);
        await user.serviceClient
          .from("channels")
          .update({
            keepalive_confirmed_at: new Date().toISOString(),
            keepalive_prompt_sent_at: null,
          })
          .eq("id", channelId);
        result = { ok: true };
        break;
      }

      default:

        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = msg.includes("Unauthorized")
      ? 401
      : msg.includes("Forbidden")
        ? 403
        : msg.includes("Rate limit")
          ? 429
          : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
