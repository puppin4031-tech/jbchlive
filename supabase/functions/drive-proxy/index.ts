import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Streams a publicly shared Google Drive file through our own origin so the
// browser can play it in a plain <video> tag (Drive's own /uc endpoint blocks
// direct playback on mobile). Range requests are forwarded so seeking works.

const FILE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

const baseHeaders = {
  ...corsHeaders,
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
};

function driveUrls(fileId: string) {
  return [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
  ];
}

function isInterstitial(res: Response) {
  const type = res.headers.get('content-type') ?? '';
  return type.includes('text/html');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }

  const url = new URL(req.url);
  const fileId = url.searchParams.get('id')?.trim() ?? '';

  if (!FILE_ID_RE.test(fileId)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing Drive file id' }), {
      status: 400,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  }

  const range = req.headers.get('range') ?? undefined;
  const forwardHeaders: Record<string, string> = {
    // Drive serves the raw bytes more reliably for a browser-like UA.
    'User-Agent': 'Mozilla/5.0 (compatible; LiveWordMission/1.0)',
  };
  if (range) forwardHeaders['Range'] = range;

  let lastStatus = 502;
  let lastBody = 'Upstream request failed';

  for (const target of driveUrls(fileId)) {
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: forwardHeaders,
        redirect: 'follow',
      });
    } catch (err) {
      lastStatus = 502;
      lastBody = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    if (!upstream.ok && upstream.status !== 206) {
      lastStatus = upstream.status;
      lastBody = (await upstream.text()).slice(0, 300);
      console.error(`drive-proxy upstream ${upstream.status} for ${fileId}: ${lastBody}`);
      continue;
    }

    // A HTML body means Drive returned a confirmation / permission page,
    // not the media bytes.
    if (isInterstitial(upstream)) {
      lastStatus = 403;
      lastBody = 'Drive returned an HTML page instead of media bytes (file may not be shared publicly).';
      await upstream.body?.cancel();
      continue;
    }

    const headers = new Headers(baseHeaders);
    headers.set('Content-Type', upstream.headers.get('content-type') ?? 'video/mp4');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600');
    const len = upstream.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) headers.set('Content-Range', contentRange);

    return new Response(req.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  }

  return new Response(
    JSON.stringify({ error: 'Drive file is not publicly streamable', details: lastBody }),
    { status: lastStatus, headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
  );
});
