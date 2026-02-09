import type { FastifyInstance } from 'fastify';
import { getMetadataCache } from './index.js';
import {
  getGateways,
  getGatewayById,
  getGatewayOperators,
  getGatewayDevices,
  getGatewayOperatorsWithDeviceCounts,
  getDevicesForGatewayOperator,
} from '../db/queries.js';

export async function gatewayRoutes(fastify: FastifyInstance): Promise<void> {
  // List all gateways
  fastify.get('/api/gateways', async () => {
    const gateways = await getGateways();
    return { gateways };
  });

  // Get gateway details
  fastify.get<{ Params: { id: string } }>('/api/gateways/:id', async (request, reply) => {
    const gateway = await getGatewayById(request.params.id);
    if (!gateway) {
      reply.code(404);
      return { error: 'Gateway not found' };
    }
    return { gateway };
  });

  // Get operators seen on gateway
  fastify.get<{
    Params: { id: string };
    Querystring: { hours?: string };
  }>('/api/gateways/:id/operators', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const operators = await getGatewayOperators(request.params.id, hours);
    return { operators };
  });

  // Get devices seen on gateway
  fastify.get<{
    Params: { id: string };
    Querystring: { hours?: string; limit?: string; rssi_min?: string; rssi_max?: string };
  }>('/api/gateways/:id/devices', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const limit = parseInt(request.query.limit ?? '100', 10);
    const rssiMin = request.query.rssi_min ? parseInt(request.query.rssi_min, 10) : undefined;
    const rssiMax = request.query.rssi_max ? parseInt(request.query.rssi_max, 10) : undefined;
    const devices = await getGatewayDevices(request.params.id, hours, limit, rssiMin, rssiMax);
    // Enrich devices with metadata
    const cache = getMetadataCache();
    if (cache) {
      for (const d of devices) {
        const meta = cache.getByDevAddr(d.dev_addr);
        if (meta) {
          (d as any).device_name = meta.device_name;
        }
      }
    }
    return { devices };
  });

  // Get gateway tree (operators with device counts for lazy-load navigation)
  fastify.get<{
    Params: { id: string };
    Querystring: { hours?: string };
  }>('/api/gateways/:id/tree', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const operators = await getGatewayOperatorsWithDeviceCounts(request.params.id, hours);
    return { operators };
  });

  // Get devices for specific operator on gateway
  fastify.get<{
    Params: { id: string; operator: string };
    Querystring: { hours?: string; limit?: string };
  }>('/api/gateways/:id/operators/:operator/devices', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const limit = parseInt(request.query.limit ?? '50', 10);
    const devices = await getDevicesForGatewayOperator(
      request.params.id,
      decodeURIComponent(request.params.operator),
      hours,
      limit
    );
    // Enrich devices with metadata
    const cache2 = getMetadataCache();
    if (cache2) {
      for (const d of devices) {
        const meta = cache2.getByDevAddr(d.dev_addr);
        if (meta) {
          d.device_name = meta.device_name;
        }
      }
    }
    return { devices };
  });
}
