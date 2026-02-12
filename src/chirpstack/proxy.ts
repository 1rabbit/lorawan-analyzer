const PROXY_TIMEOUT_MS = 30_000;

const FORWARDED_HEADERS = [
  'grpc-metadata-authorization',
  'content-type',
  'accept',
];

export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
  queryServer?: string;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Resolve target ChirpStack server URL from request context.
 * Priority: 1) X-ChirpStack-URL header  2) ?server= query param
 */
export function resolveTargetServer(headers: Record<string, string | undefined>, queryServer?: string): string | null {
  const fromHeader = headers['x-chirpstack-url'] ?? headers['X-ChirpStack-URL'];
  return fromHeader ?? queryServer ?? null;
}

/**
 * Forward a request to the target ChirpStack server and return the raw response.
 */
export async function forwardRequest(targetServer: string, req: ProxyRequest): Promise<ProxyResponse> {
  const baseUrl = targetServer.replace(/\/+$/, '');
  const url = `${baseUrl}${req.path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    // Build forwarded headers
    const forwardHeaders: Record<string, string> = {};
    for (const key of FORWARDED_HEADERS) {
      const value = req.headers[key] ?? req.headers[key.toLowerCase()];
      if (value) {
        forwardHeaders[key] = value;
      }
    }

    const response = await fetch(url, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      signal: controller.signal,
    });

    const responseBody = await response.text();

    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Grpc-Metadata-Authorization, X-ChirpStack-URL, Authorization',
    };

    // Forward content-type from ChirpStack response
    const contentType = response.headers.get('content-type');
    if (contentType) {
      responseHeaders['content-type'] = contentType;
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        status: 504,
        headers: { 'Access-Control-Allow-Origin': '*', 'content-type': 'application/json' },
        body: JSON.stringify({ error: `Timeout: pas de réponse de ${baseUrl} après 30s.` }),
      };
    }

    const msg = error instanceof Error ? error.message : String(error);
    return {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ error: `Serveur ChirpStack indisponible à ${baseUrl}. ${msg}` }),
    };
  } finally {
    clearTimeout(timeout);
  }
}
