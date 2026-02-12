import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import * as XLSX from 'xlsx';
import { ChirpStackClient } from '../chirpstack/client.js';
import {
  bulkDelete,
  migrateDevices,
  bulkChangeProfile,
  bulkUpdateTags,
} from '../import/processor.js';
import { detectSeparator } from '../parser/csv.js';

// ============================================
// Helper: extract ChirpStack client from request headers
// ============================================

function getClientFromRequest(request: FastifyRequest): ChirpStackClient {
  const url = request.headers['x-chirpstack-url'] as string | undefined;
  const authHeader = request.headers['authorization'] as string | undefined;
  if (!url) throw { statusCode: 400, message: 'Header X-ChirpStack-URL requis.' };
  if (!authHeader) throw { statusCode: 400, message: 'Header Authorization requis.' };
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return new ChirpStackClient(url, token);
}

// ============================================
// Helper: parse uploaded file to full data rows
// ============================================

function parseFullData(buffer: Buffer, filename: string): Record<string, string>[] {
  const ext = filename.toLowerCase().split('.').pop() ?? '';

  if (ext === 'xlsx' || ext === 'xls') {
    // Parse Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    return rows.map((row) => {
      const record: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        record[key] = String(value ?? '');
      }
      return record;
    });
  }

  // CSV
  const content = buffer.toString('utf-8');
  const separator = detectSeparator(content);
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const columns = lines[0].split(separator).map((col) => col.trim());
  const dataLines = lines.slice(1);

  return dataLines.map((line) => {
    const values = line.split(separator);
    const record: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
      record[columns[i]] = (values[i] ?? '').trim();
    }
    return record;
  });
}

// ============================================
// Plugin: bulk operation routes
// ============================================

export async function bulkRoutes(fastify: FastifyInstance): Promise<void> {
  // Register multipart support for this plugin scope
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // ------------------------------------------
  // POST /api/bulk/delete
  // ------------------------------------------
  fastify.post<{
    Body: { devEuis: string[] };
  }>('/api/bulk/delete', async (request, reply) => {
    const client = getClientFromRequest(request);
    const { devEuis } = request.body;

    if (!Array.isArray(devEuis) || devEuis.length === 0) {
      reply.code(400);
      return { error: 'devEuis doit être un tableau non vide.' };
    }

    const result = await bulkDelete(devEuis, client);
    return result;
  });

  // ------------------------------------------
  // POST /api/bulk/migrate
  // ------------------------------------------
  fastify.post<{
    Body: { devEuis: string[]; sourceAppId: string; destAppId: string };
  }>('/api/bulk/migrate', async (request, reply) => {
    const client = getClientFromRequest(request);
    const { devEuis, sourceAppId, destAppId } = request.body;

    if (!Array.isArray(devEuis) || devEuis.length === 0) {
      reply.code(400);
      return { error: 'devEuis doit être un tableau non vide.' };
    }

    if (!sourceAppId) {
      reply.code(400);
      return { error: 'sourceAppId est requis.' };
    }

    if (!destAppId) {
      reply.code(400);
      return { error: 'destAppId est requis.' };
    }

    const result = await migrateDevices(devEuis, client, sourceAppId, destAppId);
    return result;
  });

  // ------------------------------------------
  // POST /api/bulk/change-profile
  // ------------------------------------------
  fastify.post<{
    Body: { devEuis: string[]; newDeviceProfileId: string };
  }>('/api/bulk/change-profile', async (request, reply) => {
    const client = getClientFromRequest(request);
    const { devEuis, newDeviceProfileId } = request.body;

    if (!Array.isArray(devEuis) || devEuis.length === 0) {
      reply.code(400);
      return { error: 'devEuis doit être un tableau non vide.' };
    }

    if (!newDeviceProfileId) {
      reply.code(400);
      return { error: 'newDeviceProfileId est requis.' };
    }

    const result = await bulkChangeProfile(devEuis, client, newDeviceProfileId);
    return result;
  });

  // ------------------------------------------
  // POST /api/bulk/update-tags
  // ------------------------------------------
  fastify.post('/api/bulk/update-tags', async (request, reply) => {
    let fileBuffer: Buffer | undefined;
    let filename = '';
    let mode: 'merge' | 'replace' = 'merge';

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        filename = part.filename;
      } else {
        // field
        if (part.fieldname === 'mode') {
          mode = part.value as 'merge' | 'replace';
        }
      }
    }

    if (!fileBuffer || !filename) {
      reply.code(400);
      return { error: 'Fichier requis (CSV ou XLSX).' };
    }

    // Parse the full file to get all data rows
    const data = parseFullData(fileBuffer, filename);

    if (data.length === 0) {
      reply.code(400);
      return { error: 'Le fichier est vide ou ne contient pas de données.' };
    }

    // Verify dev_eui column exists
    const firstRowKeys = Object.keys(data[0]);
    if (!firstRowKeys.includes('dev_eui')) {
      reply.code(400);
      return { error: "Colonne 'dev_eui' introuvable dans le fichier." };
    }

    const client = getClientFromRequest(request);
    const result = await bulkUpdateTags(data, client, mode);
    return result;
  });
}
