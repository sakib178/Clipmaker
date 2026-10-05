/**
 * Safe JSON Fetch & YouTube Metadata Utility
 * Prevents "Unexpected token '<', \"<!doctype \"... is not valid JSON" errors when
 * reverse proxies (Nginx warmup.html / cookie_check.html) or gateways return HTML instead of JSON.
 */

export interface SafeJsonResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  isHtmlFallback?: boolean;
}

export async function safeFetchJson<T = any>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 0
): Promise<SafeJsonResult<T>> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let lastStatus = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        ...options,
        headers,
        signal: options.signal || AbortSignal.timeout(120_000),
      });
      lastStatus = res.status;

      const rawText = await res.text();
      const trimmed = rawText.trim();

      // Detect HTML responses (e.g. <!doctype html> from Nginx warmup.html, cookie_check.html, or SPA fallback)
      const looksLikeHtml =
        trimmed.startsWith('<') ||
        /^<!doctype/i.test(trimmed) ||
        (res.headers.get('content-type') || '').includes('text/html');

      if (looksLikeHtml || ([502, 503, 504].includes(res.status) && !trimmed.startsWith('{') && !trimmed.startsWith('['))) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
          continue;
        }
        return {
          ok: false,
          status: res.status >= 400 ? res.status : 503,
          data: {
            error: 'The server is warming up or temporarily unavailable. Retry shortly.',
          } as unknown as T,
          isHtmlFallback: true,
        };
      }

      if (!trimmed) {
        return {
          ok: res.ok,
          status: res.status,
          data: {} as T,
        };
      }

      try {
        const parsed = JSON.parse(trimmed) as T;
        return {
          ok: res.ok,
          status: res.status,
          data: parsed,
        };
      } catch {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
          continue;
        }
        return {
          ok: false,
          status: res.status >= 400 ? res.status : 500,
          data: {
            error: 'Received an unexpected non-JSON response from server.',
          } as unknown as T,
          isHtmlFallback: true,
        };
      }
    } catch (netErr: any) {
      if (options.signal?.aborted || netErr?.name === 'AbortError') throw netErr;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 750 * (attempt + 1)));
        continue;
      }
      return {
        ok: false,
        status: lastStatus,
        data: {
          error: netErr?.message || 'Network request failed',
        } as unknown as T,
        isHtmlFallback: true,
      };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: { error: 'Request failed after retries' } as unknown as T,
    isHtmlFallback: true,
  };
}

export function extractClientYoutubeId(urlOrId: string): string | null {
  if (typeof urlOrId !== 'string') return null;
  const input = urlOrId.trim();
  if (/^[\w-]{11}$/.test(input)) return input;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return validId(url.pathname.split('/')[1]);
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) return null;
    return validId(url.searchParams.get('v') || (/^\/(embed|shorts|live|v)\//.test(url.pathname) ? url.pathname.split('/')[2] : ''));
  } catch { return null; }
}

function validId(value: string | null) { return value && /^[\w-]{11}$/.test(value) ? value : null; }

export async function fetchClientYoutubeMetadata(videoId: string): Promise<{
  title: string;
  author: string;
  thumbnail: string;
}> {
  let title = `YouTube Video (${videoId})`;
  let author = 'YouTube Creator';
  let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const res = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const text = await res.text();
      if (!text.trim().startsWith('<')) {
        const data = JSON.parse(text);
        if (data?.title) title = data.title;
        if (data?.author_name) author = data.author_name;
        if (data?.thumbnail_url) thumbnail = data.thumbnail_url;
      }
    }
  } catch {
    // Keep default metadata
  }

  return { title, author, thumbnail };
}
