export class ApiResponseError extends Error {
  status: number;
  contentType: string;

  constructor(message: string, status: number, contentType: string) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
    this.contentType = contentType;
  }
}

/**
 * Safely parses a fetch Response, verifying HTTP status and Content-Type
 * before calling JSON.parse. Prevents "Unexpected token '<'" errors when an
 * upstream server, proxy, or route fallback returns HTML instead of JSON.
 */
export async function parseApiResponse<T = Record<string, unknown>>(
  res: Response,
  fallbackError = 'Request failed.'
): Promise<T> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    if (!res.ok) {
      throw new ApiResponseError(
        `${fallbackError} (HTTP ${res.status}, empty server response)`,
        res.status,
        contentType
      );
    }
    return {} as T;
  }

  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (looksLikeHtml) {
    const titleMatch = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : '';
    if (/cookie check|sign in|authenticate/i.test(pageTitle)) {
      throw new ApiResponseError(
        `Preview session cookie check intercepted the API request (HTTP ${res.status}, "${pageTitle}"). Refresh the page or open the app preview in a new browser tab and try again.`,
        res.status,
        contentType
      );
    }
    const titleSuffix = pageTitle ? ` — "${pageTitle}"` : '';
    throw new ApiResponseError(
      `Server returned an HTML page instead of JSON (HTTP ${res.status}, Content-Type: ${
        contentType || 'unknown'
      }${titleSuffix}). Verify that the backend API route is running and reachable.`,
      res.status,
      contentType
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ApiResponseError(
      `Invalid JSON response from server (HTTP ${res.status}, Content-Type: ${
        contentType || 'unknown'
      }).`,
      res.status,
      contentType
    );
  }

  if (!res.ok) {
    const obj = parsed as { error?: unknown; message?: unknown };
    const serverMessage =
      typeof obj?.error === 'string'
        ? obj.error
        : typeof obj?.message === 'string'
        ? obj.message
        : `${fallbackError} (HTTP ${res.status})`;
    throw new ApiResponseError(serverMessage, res.status, contentType);
  }

  return parsed as T;
}
