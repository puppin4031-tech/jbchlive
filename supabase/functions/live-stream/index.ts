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

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

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
          key: "mux-video-audio",
          container: "fmp4",
          elementaryStreams: ["video-stream", "audio-stream"],
        },
      ],
      manifests: [
        {
          fileName: "main.m3u8",
          type: "HLS",
          muxStreams: ["mux-video-audio"],
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

async function getHLSUrl(channelId: string) {
  const channel = await getChannelGCP(channelId);
  const manifest = channel.manifests?.[0];
  const outputUri = channel.output?.uri || "";
  const hlsUrl = `${outputUri}${manifest?.fileName || "main.m3u8"}`;
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

    // Step 2: Create or fetch Channel
    try {
      await getChannelGCP(gcpChannelId);
    } catch {
      await createChannel(gcpChannelId, inputId);
    }

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
  autoStopIdleChannels: { max: 30, windowSec: 60 },
};

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

    // === Cron-triggered: autoStopIdleChannels ===
    // Authenticated via service-role secret in body for cron use.
    if (action === "autoStopIdleChannels") {
      const cronSecret = req.headers.get("x-cron-secret");
      const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!cronSecret || cronSecret !== expected) {
        throw new Error("Unauthorized");
      }
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: idle } = await serviceClient
        .from("channels")
        .select("id")
        .eq("is_live", true)
        .lt("live_started_at", cutoff);

      const stopped: string[] = [];
      for (const ch of idle ?? []) {
        const gcpChannelId = gcpResourceId(ch.id, "channel");
        try {
          // Check GCP state — only stop if not actively streaming
          const gcpCh = await getChannelGCP(gcpChannelId).catch(() => null);
          const state = gcpCh?.streamingState;
          if (state && state !== "STREAMING") {
            await stopChannelGCP(gcpChannelId).catch(() => null);
            await serviceClient
              .from("channels")
              .update({ is_live: false, gcp_channel_state: "STOPPED" })
              .eq("id", ch.id);
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

    // === Authenticated user actions ===
    const authHeader = req.headers.get("authorization");
    const user = await verifyUser(authHeader);

    const { channelId, vodTitle, vodCategory, vodPreacher } = body;

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
          })
          .eq("id", channelId);
        break;
      }

      case "stopChannel": {
        if (!channelId) throw new Error("channelId required");
        const gcpChannelId = gcpResourceId(channelId, "channel");

        let recordingUrl: string | null = null;
        try {
          const hlsInfo = await getHLSUrl(gcpChannelId);
          if (hlsInfo.hlsUrl) recordingUrl = hlsInfo.hlsUrl;
        } catch {
          // ok
        }

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

        await user.serviceClient
          .from("channels")
          .update({ is_live: false, gcp_channel_state: "STOPPED" })
          .eq("id", channelId);

        // Auto-save VOD
        const title =
          typeof vodTitle === "string" && vodTitle.trim()
            ? vodTitle.trim()
            : `라이브 녹화 ${new Date().toLocaleDateString("ko-KR")}`;
        const category =
          typeof vodCategory === "string" && vodCategory.trim()
            ? vodCategory.trim()
            : "주일말씀";
        const preacher =
          typeof vodPreacher === "string" && vodPreacher.trim()
            ? vodPreacher.trim()
            : null;

        const { data: vodData, error: vodError } = await user.serviceClient
          .from("sermons")
          .insert({
            channel_id: channelId,
            title,
            category,
            preacher,
            video_url: recordingUrl,
            is_live: false,
            sermon_date: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (vodError) console.error("VOD auto-save error:", vodError);
        result = { ...(result as object), vod: vodData || null };
        break;
      }

      case "getStatus": {
        if (!channelId) throw new Error("channelId required");
        const gcpChannelId = gcpResourceId(channelId, "channel");
        const gcpCh = await getChannelGCP(gcpChannelId);
        const state = gcpCh.streamingState || "UNKNOWN";
        // Sync DB
        await user.serviceClient
          .from("channels")
          .update({ gcp_channel_state: state })
          .eq("id", channelId);
        result = {
          streamingState: state,
          inputAttachments: gcpCh.inputAttachments,
          activeInput: gcpCh.activeInput,
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
