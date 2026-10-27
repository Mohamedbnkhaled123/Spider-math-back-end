/**
 * Fetches the exact video duration in seconds directly from YouTube watch page HTML.
 * Uses lengthSeconds metadata.
 */
export async function fetchYouTubeVideoDurationSec(videoId: string): Promise<number | null> {
  if (!videoId || videoId.length !== 11) return null;
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"lengthSeconds":"(\d+)"/);
    if (match && match[1]) {
      const sec = parseInt(match[1], 10);
      if (sec > 0) return sec;
    }
    return null;
  } catch (err: any) {
    console.warn(`[YouTubeDuration] Could not fetch duration for ${videoId}:`, err?.message || err);
    return null;
  }
}
