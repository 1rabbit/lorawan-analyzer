import type { FastifyInstance } from 'fastify';
import { resolveTargetServer, forwardRequest } from '../chirpstack/proxy.js';

export async function chirpstackProxyRoutes(fastify: FastifyInstance): Promise<void> {
  // Forward all methods to ChirpStack (including OPTIONS preflight)
  fastify.all<{
    Params: { '*': string };
    Querystring: { server?: string };
  }>('/proxy/*', async (request, reply) => {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      reply
        .header('Access-Control-Allow-Origin', '*')
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type, Grpc-Metadata-Authorization, X-ChirpStack-URL, Authorization')
        .header('Access-Control-Max-Age', '86400')
        .code(204)
        .send();
      return;
    }
    // Resolve target server
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }

    const targetServer = resolveTargetServer(headers, request.query.server);

    if (!targetServer) {
      reply.code(400);
      return {
        error: 'Serveur cible manquant. Ajoutez le header X-ChirpStack-URL ou le query param ?server=<url>.',
      };
    }

    // Validate URL format
    if (!targetServer.startsWith('http://') && !targetServer.startsWith('https://')) {
      reply.code(400);
      return {
        error: "L'URL du serveur doit commencer par http:// ou https://.",
      };
    }

    // Build proxy path: everything after /proxy
    const proxyPath = `/${request.params['*']}`;

    // Preserve original query string (minus the 'server' param we consumed)
    const url = new URL(request.url, 'http://localhost');
    url.searchParams.delete('server');
    const queryString = url.searchParams.toString();
    const fullPath = queryString ? `${proxyPath}?${queryString}` : proxyPath;

    // Get raw body for POST/PUT
    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = JSON.stringify(request.body);
    }

    const proxyResponse = await forwardRequest(targetServer, {
      method: request.method,
      path: fullPath,
      headers,
      body,
    });

    // Set response headers
    for (const [key, value] of Object.entries(proxyResponse.headers)) {
      reply.header(key, value);
    }

    reply.code(proxyResponse.status).send(proxyResponse.body);
  });
}
