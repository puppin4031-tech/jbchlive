/**
 * Origin-restricted CORS helper.
 *
 * Public playback endpoints (HLS proxy, drive proxy) intentionally stay open to
 * every origin so anonymous viewers can watch without signing in. Everything
 * that spends money or touches user data uses this allow-list instead of "*".
 */

const ALLOWED_EXACT = new Set([
  "https://jbchlive.lovable.app",
]);

// Lovable preview/sandbox domains and local development.
const ALLOWED_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/i,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/i,
  /^https:\/\/[a-z0-9-]+\.lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_EXACT.has(origin)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(origin));
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (isAllowedOrigin(origin)) {
    return { ...BASE_HEADERS, "Access-Control-Allow-Origin": origin! };
  }
  // Non-browser callers (no Origin header) are unaffected; disallowed browser
  // origins simply get no ACAO header and are blocked by the browser.
  return { ...BASE_HEADERS };
}
