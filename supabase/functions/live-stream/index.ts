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

// --- API Handlers ---

async function createInput(inputId: string) {
  const url = `${BASE_URL}/inputs?inputId=${inputId}`;
  return gcpFetch(url, {
    method: "POST",
    body: JSON.stringify({
      type: "RTMP_PUSH",
      securityRules: { ipRanges: ["0.0.0.0/0"] },
    }),
  });
}

async function createChannel(channelId: string, inputId: string) {
  const inputName = `projects/${PROJECT_ID}/locations/${LOCATION}/inputs/${inputId}`;
  const url = `${BASE_URL}/channels?channelId=${channelId}`;
  return gcpFetch(url, {
    method: "POST",
    body: JSON.stringify({
      inputAttachments: [{ key: "primary", input: inputName }],
      output: { uri: `gs://${PROJECT_ID}-live-output/${channelId}/` },
      elementaryStreams: [
        {
          key: "video-stream",
          videoStream: {
            h264: { profile: "high", bitrateBps: 3000000, frameRate: 30, widthPixels: 1920, heightPixels: 1080 },
          },
        },
        {
          key: "audio-stream",
          audioStream: { codec: "aac", bitrateBps: 128000, channelCount: 2, sampleRateHertz: 48000 },
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
}

async function startChannelGCP(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:start`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function stopChannelGCP(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:stop`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function getChannelStatus(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}`;
  return gcpFetch(url);
}

async function getHLSUrl(channelId: string) {
  const channel = await getChannelStatus(channelId);
  const manifest = channel.manifests?.[0];
  const outputUri = channel.output?.uri || "";
  const hlsUrl = `${outputUri}${manifest?.fileName || "main.m3u8"}`;
  return {
    hlsUrl,
    streamingState: channel.streamingState,
    inputUri: channel.inputAttachments?.[0]?.input,
  };
}

// --- In-memory Rate Limiter ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowSec: number }> = {
  createInput:   { max: 3, windowSec: 60 },
  createChannel: { max: 3, windowSec: 60 },
  startChannel:  { max: 5, windowSec: 60 },
  stopChannel:   { max: 5, windowSec: 60 },
  getStatus:     { max: 30, windowSec: 60 },
  getHLSUrl:     { max: 30, windowSec: 60 },
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
    const authHeader = req.headers.get("authorization");
    const user = await verifyUser(authHeader);

    const { action, inputId, channelId, vodTitle, vodCategory, vodPreacher } = await req.json();

    // Validate input IDs to prevent injection
    const ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;
    if (inputId && !ID_REGEX.test(inputId)) throw new Error("Invalid inputId format");
    if (channelId && !ID_REGEX.test(channelId)) throw new Error("Invalid channelId format");
    if (action && !ID_REGEX.test(action)) throw new Error("Invalid action format");
    checkRateLimit(user.id, action);

    // Actions that require admin only
    const adminOnlyActions = ["createInput", "createChannel"];
    if (adminOnlyActions.includes(action) && !user.isAdmin) {
      throw new Error("Forbidden: admin only");
    }

    // Actions that require channel owner or admin
    const channelActions = ["startChannel", "stopChannel", "getStatus", "getHLSUrl"];
    if (channelActions.includes(action) && channelId) {
      await verifyChannelAccess(user, channelId);
    }

    let result: unknown;

    switch (action) {
      case "createInput":
        if (!inputId) throw new Error("inputId required");
        result = await createInput(inputId);
        break;
      case "createChannel":
        if (!channelId || !inputId) throw new Error("channelId and inputId required");
        result = await createChannel(channelId, inputId);
        break;
      case "startChannel": {
        if (!channelId) throw new Error("channelId required");
        result = await startChannelGCP(channelId);
        // Update is_live in DB
        await user.serviceClient
          .from("channels")
          .update({ is_live: true })
          .eq("id", channelId);
        break;
      }
      case "stopChannel": {
        if (!channelId) throw new Error("channelId required");
        result = await stopChannelGCP(channelId);
        // Update is_live in DB
        await user.serviceClient
          .from("channels")
          .update({ is_live: false })
          .eq("id", channelId);
        break;
      }
      case "getStatus":
        if (!channelId) throw new Error("channelId required");
        result = await getChannelStatus(channelId);
        break;
      case "getHLSUrl":
        if (!channelId) throw new Error("channelId required");
        result = await getHLSUrl(channelId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = msg.includes("Unauthorized") ? 401
      : msg.includes("Forbidden") ? 403
      : msg.includes("Rate limit") ? 429
      : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
