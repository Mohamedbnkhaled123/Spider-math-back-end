import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';

/**
 * Validates and normalizes unprotected YouTube video and community post solution links.
 * Used for teacher corrective feedback (custom_mistake_cases) and question solution links.
 * Zero Image Bloat: only text and YouTube URLs.
 */
export function validateAndNormalizeYouTubeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // Verify domain is youtube.com or youtu.be
    const isYouTubeDomain =
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be';

    if (!isYouTubeDomain) {
      throw new AppError(
        'Invalid YouTube solution URL: Domain must be youtube.com or youtu.be',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    // 1. Short URL: https://youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.slice(1).split('/')[0];
      if (!videoId || videoId.length < 5) {
        throw new AppError('Invalid youtu.be link: missing video ID', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      const timeParam = parsed.searchParams.get('t');
      return timeParam
        ? `https://www.youtube.com/watch?v=${videoId}&t=${timeParam}`
        : `https://www.youtube.com/watch?v=${videoId}`;
    }

    // 2. Shorts: https://www.youtube.com/shorts/VIDEO_ID
    if (parsed.pathname.startsWith('/shorts/')) {
      const videoId = parsed.pathname.replace('/shorts/', '').split('/')[0];
      if (!videoId || videoId.length < 5) {
        throw new AppError('Invalid YouTube Shorts link: missing video ID', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // 3. Embed: https://www.youtube.com/embed/VIDEO_ID
    if (parsed.pathname.startsWith('/embed/')) {
      const videoId = parsed.pathname.replace('/embed/', '').split('/')[0];
      if (!videoId || videoId.length < 5) {
        throw new AppError('Invalid YouTube Embed link: missing video ID', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // 4. Community Post: https://www.youtube.com/post/POST_ID or with ?lb=POST_ID
    if (parsed.pathname.startsWith('/post/')) {
      const postId = parsed.pathname.replace('/post/', '').split('/')[0];
      if (!postId || postId.length < 5) {
        throw new AppError('Invalid YouTube Post link: missing post ID', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      return `https://www.youtube.com/post/${postId}`;
    }

    if (parsed.searchParams.has('lb')) {
      const postId = parsed.searchParams.get('lb');
      if (postId) {
        return `https://www.youtube.com/post/${postId}`;
      }
    }

    // 5. Standard Watch: https://www.youtube.com/watch?v=VIDEO_ID
    if (parsed.pathname === '/watch') {
      const videoId = parsed.searchParams.get('v');
      if (!videoId || videoId.length < 5) {
        throw new AppError('Invalid YouTube Watch link: missing "v" parameter', 400, ERROR_CODES.BAD_REQUEST_400);
      }
      const timeParam = parsed.searchParams.get('t');
      return timeParam
        ? `https://www.youtube.com/watch?v=${videoId}&t=${timeParam}`
        : `https://www.youtube.com/watch?v=${videoId}`;
    }

    // Fallback: If valid youtube URL but unparsed pattern, return sanitized HTTPS origin + path
    return parsed.toString();
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid URL format for YouTube solution', 400, ERROR_CODES.BAD_REQUEST_400);
  }
}
