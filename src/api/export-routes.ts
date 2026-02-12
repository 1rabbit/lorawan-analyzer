import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ChirpStackClient } from '../chirpstack/client.js';
import { exportDevices } from '../import/processor.js';
import { getImportProfileById } from '../db/queries.js';

function getClientFromRequest(request: FastifyRequest): ChirpStackClient {
  const url = request.headers['x-chirpstack-url'] as string | undefined;
  const authHeader = request.headers['authorization'] as string | undefined;
  if (!url) throw { statusCode: 400, message: 'Header X-ChirpStack-URL requis.' };
  if (!authHeader) throw { statusCode: 400, message: 'Header Authorization requis.' };
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  return new ChirpStackClient(url, token);
}

export async function exportRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================
  // GET /api/export/devices — Export devices as CSV or XLSX
  // ============================================
  fastify.get<{
    Querystring: {
      applicationId?: string;
      includeKeys?: string;
      format?: string;
      filterDp?: string;
      filterActivity?: string;
      filterTag?: string;
    };
  }>('/api/export/devices', async (request, reply) => {
    const client = getClientFromRequest(request);
    const { applicationId, filterDp, filterActivity, filterTag } = request.query;

    if (!applicationId) {
      reply.code(400);
      return { error: 'Le paramètre applicationId est requis.' };
    }

    const includeKeys = request.query.includeKeys === 'true';
    const format = (request.query.format === 'xlsx' ? 'xlsx' : 'csv') as 'csv' | 'xlsx';

    const buffer = await exportDevices({
      client,
      applicationId,
      includeKeys,
      format,
      filterDp,
      filterActivity: filterActivity as 'active' | 'inactive' | 'never_seen' | undefined,
      filterTag,
    });

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="devices.csv"');
    } else {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', 'attachment; filename="devices.xlsx"');
    }

    return reply.send(buffer);
  });

  // ============================================
  // GET /api/templates/csv — Download a CSV template with headers only
  // ============================================
  fastify.get<{
    Querystring: {
      profileId?: string;
      includeDeviceProfileId?: string;
    };
  }>('/api/templates/csv', async (request, reply) => {
    const { profileId, includeDeviceProfileId } = request.query;

    const columns: string[] = ['dev_eui', 'app_key', 'name', 'description'];

    if (includeDeviceProfileId !== 'false') {
      columns.push('device_profile_id');
    }

    if (profileId) {
      const profile = await getImportProfileById(profileId);
      if (profile) {
        columns.push(...profile.required_tags);
      }
    }

    const headerLine = columns.join(';');

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="template.csv"');

    return reply.send(headerLine);
  });
}
