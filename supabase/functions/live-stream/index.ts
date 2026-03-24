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

  // Import RSA private key
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

// --- Verify admin role ---

async function verifyAdmin(authHeader: string | null) {
  if (!authHeader) throw new Error("Unauthorized");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const { data: roles } = await createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!roles || roles.length === 0) throw new Error("Forbidden: admin only");
  return user;
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

async function startChannel(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:start`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function stopChannel(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}:stop`;
  return gcpFetch(url, { method: "POST", body: "{}" });
}

async function getChannelStatus(channelId: string) {
  const url = `${BASE_URL}/channels/${channelId}`;
  return gcpFetch(url);
}

async function getHLSUrl(channelId: string) {
  const channel = await getChannelStatus(channelId);
  // HLS URL from the output config
  const manifest = channel.manifests?.[0];
  const outputUri = channel.output?.uri || "";
  const hlsUrl = `${outputUri}${manifest?.fileName || "main.m3u8"}`;
  return {
    hlsUrl,
    streamingState: channel.streamingState,
    inputUri: channel.inputAttachments?.[0]?.input,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    await verifyAdmin(authHeader);

    const { action, inputId, channelId } = await req.json();
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
      case "startChannel":
        if (!channelId) throw new Error("channelId required");
        result = await startChannel(channelId);
        break;
      case "stopChannel":
        if (!channelId) throw new Error("channelId required");
        result = await stopChannel(channelId);
        break;
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
    const status = msg.includes("Unauthorized") ? 401 : msg.includes("Forbidden") ? 403 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
