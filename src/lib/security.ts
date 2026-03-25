/**
 * Client-side security utilities
 */

// --- Rate Limiter ---
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function clientRateLimit(key: string, maxPerMinute: number = 10): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (bucket.count >= maxPerMinute) return false;
  bucket.count++;
  return true;
}

// --- XSS Sanitization ---
const DANGEROUS_PATTERNS = [
  /<script\b/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:\s*text\/html/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<form\b/gi,
];

export function sanitizeText(input: string): string {
  let cleaned = input;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Encode HTML entities
  cleaned = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  return cleaned;
}

// --- URL Validation ---
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// --- DevTools Detection (informational, not blocking) ---
let devToolsWarned = false;

export function setupSecurityMonitoring() {
  // Detect context menu and common devtools shortcuts (informational logging)
  if (import.meta.env.PROD) {
    // Disable right-click context menu in production
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Log devtools open attempts
    const detectDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!devToolsWarned) {
          devToolsWarned = true;
          console.warn('%c⚠️ 보안 경고', 'font-size:24px;color:red;font-weight:bold');
          console.warn(
            '%c이 콘솔은 개발자 전용입니다. 악의적인 코드를 붙여넣지 마세요.',
            'font-size:14px;color:orange'
          );
        }
      }
    };

    window.addEventListener('resize', detectDevTools);
    detectDevTools();
  }
}

// --- Freeze auth state to prevent tampering ---
export function freezeObject<T extends object>(obj: T): T {
  return Object.freeze(obj);
}
