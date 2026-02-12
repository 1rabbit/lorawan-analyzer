import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { parseFile } from '../parser/csv.js';
import { validateImportData } from '../import/validator.js';
import { executeImport, undoImport } from '../import/processor.js';
import { ChirpStackClient } from '../chirpstack/client.js';
import { getImportProfileById } from '../db/queries.js';

// ============================================
// Helper: extract ChirpStack client from request headers
// ============================================

function getClientFromRequest(request: FastifyRequest): ChirpStackClient {
  const headers = request.headers;
  const url = headers['x-chirpstack-url'] as string | undefined;
  const authHeader = headers['authorization'] as string | undefined;
  if (!url) throw { statusCode: 400, message: 'Header X-ChirpStack-URL requis.' };
  if (!authHeader) throw { statusCode: 400, message: 'Header Authorization requis.' };
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return new ChirpStackClient(url, token);
}

// ============================================
// Import Routes Plugin
// ============================================

export async function importRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart support for file uploads
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // ------------------------------------------
  // POST /api/import/parse-csv
  // ------------------------------------------
  fastify.post('/api/import/parse-csv', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: 'Aucun fichier fourni.' };
    }

    const buffer = await file.toBuffer();
    const result = parseFile(buffer, file.filename);
    return result;
  });

  // ------------------------------------------
  // POST /api/import/validate
  // ------------------------------------------
  fastify.post<{
    Body: {
      data: Record<string, string>[];
      mapping: Record<string, string>;
      profileId?: string;
      applicationId: string;
      deviceProfileId?: string;
    };
  }>('/api/import/validate', async (request, reply) => {
    const client = getClientFromRequest(request);
    const { data, mapping, profileId, deviceProfileId } = request.body;

    let profile;
    if (profileId) {
      profile = await getImportProfileById(profileId);
      if (!profile) {
        reply.code(404);
        return { error: 'Profil d\'import introuvable.' };
      }
    }

    const result = await validateImportData({ data, mapping, profile, client, deviceProfileId });
    return result;
  });

  // ------------------------------------------
  // POST /api/import/execute
  // ------------------------------------------
  fastify.post<{
    Body: {
      data: Record<string, string>[];
      mapping: Record<string, string>;
      profileId?: string;
      tags?: Record<string, string>;
      applicationId: string;
      deviceProfileId: string;
      duplicateAction: 'skip' | 'overwrite';
    };
  }>('/api/import/execute', async (request) => {
    const client = getClientFromRequest(request);
    const { data, mapping, profileId, tags, applicationId, deviceProfileId, duplicateAction } = request.body;

    let profile;
    if (profileId) {
      profile = await getImportProfileById(profileId);
    }

    const result = await executeImport({
      data,
      mapping,
      profileId,
      profile: profile ?? undefined,
      additionalTags: tags ?? {},
      client,
      applicationId,
      deviceProfileId,
      duplicateAction,
    });
    return result;
  });

  // ------------------------------------------
  // POST /api/import/undo
  // ------------------------------------------
  fastify.post<{
    Body: { devEuis: string[] };
  }>('/api/import/undo', async (request) => {
    const client = getClientFromRequest(request);
    const { devEuis } = request.body;

    const result = await undoImport(devEuis, client);
    return result;
  });
}
