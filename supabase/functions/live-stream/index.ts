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
// Use deterministic IDs based on channel UUID so we can re-find them.
// GCP IDs: lowercase letters, digits, hyphens, max 63 chars, must start with letter.
function gcpResourceId(channelUuid: string, kind: "input" | "channel"): string {
  // Strip hyphens, take first 24 hex chars, prefix
  const short = channelUuid.replace(/-/g, "").slice(0, 24);
  return `${kind === "input" ? "in" : "ch"}-${short}`;
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

async function createChannel(channelId: string, inputId: string) {
  const inputName = `projects/${PROJECT_ID}/locations/${LOCATION}/inputs/${inputId}`;
  const url = `${BASE_URL}/channels?channelId=${channelId}`;
  const op = await gcpFetch(url, {
    method: "POST",
    body: JSON.stringify({
      inputAttachments: [{ key: "primary", input: inputName }],
      output: { uri: `gs://${PROJECT_ID}-live-output/${channelId}/` },
      elementaryStreams: [
        {
          key: "video-stream",
          videoStream: {
            h264: {
              profile: "high",
              bitrateBps: 3000000,
              frameRate: 30,
              widthPixels: 1920,
              heightPixels: 1080,
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
 * Provision GCP Input + Channel for a given DB channel UUID.
 * Idempotent: if already provisioned, returns existing URI.
 * Clean-up: if channel creation fails after input was created, deletes the input.
 */
async function provisionChannel(
  serviceClient: ReturnType<typeof createClient>,
  channelUuid: string
) {
  // Check existing state
  const { data: existing } = await serviceClient
    .from("channels")
    .select("gcp_input_uri")
    .eq("id", channelUuid)
    .single();

  const inputId = gcpResourceId(channelUuid, "input");
  const gcpChannelId = gcpResourceId(channelUuid, "channel");

  // If already provisioned with URI, verify GCP still has it
  if (existing?.gcp_input_uri) {
    try {
      const input = await getInput(inputId);
      if (input?.uri) {
        return { gcp_input_uri: input.uri, alreadyProvisioned: true };
      }
    } catch {
      // Input missing on GCP, will recreate
    }
  }

  let inputCreated = false;
  try {
    // Step 1: Create or fetch Input
    let input;
    try {
      input = await getInput(inputId);
    } catch {
      input = await createInput(inputId);
      inputCreated = true;
    }

    if (!input?.uri) {
      throw new Error("Input created but no RTMP URI returned");
    }
    const inputUri = input.uri;

    // Step 2: Ensure Channel matches current config.
    // Best-effort cleanup: if a channel already exists (possibly from a failed
    // earlier attempt with a different mux config), delete it before recreating.
    try {
      await getChannelGCP(gcpChannelId);
      // Exists — delete to ensure fresh creation with current mux config
      await deleteChannelGCP(gcpChannelId).catch((e) =>
        console.error("Cleanup deleteChannel failed:", e)
      );
    } catch {
      // Channel does not exist, nothing to clean up
    }
    await createChannel(gcpChannelId, inputId);

    // Step 3: Save to DB
    const { error: dbErr } = await serviceClient
      .from("channels")
      .update({
        gcp_input_uri: inputUri,
        gcp_provisioned_at: new Date().toISOString(),
        gcp_last_error: null,
      })
      .eq("id", channelUuid);
    if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

    return { gcp_input_uri: inputUri, alreadyProvisioned: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Clean-up: if we created the input but channel failed, delete the input
    if (inputCreated) {
      await deleteInput(inputId).catch((e) =>
        console.error("Cleanup deleteInput failed:", e)
      );
    }
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
  // Cleanup stale presence first (>5 minutes)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await serviceClient.from("viewer_presence").delete().lt("last_seen_at", fiveMinAgo);

  const { data: liveChannels } = await serviceClient
    .from("channels")
    .select("id")
    .eq("is_live", true);

  const ninetySecAgo = new Date(Date.now() - 90 * 1000).toISOString();
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
      .gte("last_seen_at", ninetySecAgo);

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
        const gcpChannelId = gcpResourceId(channelId, "channel");
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
            ...(reason ? { gcp_last_error: reason } : {}),
          })
          .eq("id", channelId);
        // History: close session (never throws)
        await closeLiveSession(serviceClient, channelId, endReason);
      };

      if (action === "autoStopIdleChannels") {
        // Stop channels that are marked live but have no RTMP input (AWAITING_INPUT)
        // for longer than the channel's auto_stop_idle_minutes setting.
        const { data: liveChannels } = await serviceClient
          .from("channels")
          .select("id, live_started_at, auto_stop_idle_minutes")
          .eq("is_live", true);

        const stopped: string[] = [];
        const now = Date.now();
        for (const ch of liveChannels ?? []) {
          const idleMin = ch.auto_stop_idle_minutes ?? 15;
          const startedAt = ch.live_started_at ? new Date(ch.live_started_at).getTime() : 0;
          const elapsedMin = (now - startedAt) / 60000;
          if (elapsedMin < idleMin) continue;

          const gcpChannelId = gcpResourceId(ch.id, "channel");
          try {
            const gcpCh = await getChannelGCP(gcpChannelId).catch(() => null);
            const state = gcpCh?.streamingState;
            // Stop if GCP says no input flowing
            if (state === "AWAITING_INPUT" || state === "PENDING" || !state) {
              await stopOne(
                ch.id,
                `자동 종료: ${idleMin}분간 RTMP 입력 없음 (상태: ${state ?? "UNKNOWN"})`
              );
              stopped.push(ch.id);
            }
          } catch (e) {
            console.error("autoStop error for", ch.id, e);
          }
        }
        return new Response(JSON.stringify({ stopped }), {
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
            await stopOne(ch.id);
            stopped.push(ch.id);
          } catch (e) {
            console.error("scheduledStop error for", ch.id, e);
          }
        }
        return new Response(JSON.stringify({ stopped }), {
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
          })
          .eq("id", channelId);
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
            ...(forceReason ? { gcp_last_error: forceReason } : {}),
          })
          .eq("id", channelId);

        // No auto-VOD: live manifest URL is ephemeral and would 404 after stop.
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
