import type { FastifyInstance } from 'fastify';
import {
  getTimeSeries,
  getDutyCycleStats,
  getDownlinkStats,
  getChannelDistribution,
  getSFDistribution,
  getSummaryStats,
  getOperatorStats,
  getRecentPackets,
  type DeviceFilter,
} from '../db/queries.js';
import { getMetadataCache } from './index.js';

// Parse prefixes string into DeviceFilter
function parseDeviceFilter(filterMode: string, prefixes?: string): DeviceFilter | undefined {
  if (filterMode === 'all' || !prefixes) return undefined;

  const parsedPrefixes = prefixes.split(',').map(p => {
    const [prefixHex, bitsStr] = p.split('/');
    const bits = parseInt(bitsStr || '32', 10);
    const prefix = parseInt(prefixHex, 16);
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    return { prefix: (prefix & mask) >>> 0, mask };
  });

  if (filterMode === 'owned') {
    return { include: parsedPrefixes };
  } else if (filterMode === 'foreign') {
    return { exclude: parsedPrefixes };
  }
  return undefined;
}

export async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  // Get summary stats
  fastify.get<{
    Querystring: { hours?: string; gateway_id?: string; filter_mode?: string; prefixes?: string };
  }>('/api/stats/summary', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const stats = await getSummaryStats(hours, request.query.gateway_id, deviceFilter);
    return stats;
  });

  // Get operator stats
  fastify.get<{
    Querystring: { hours?: string; gateway_id?: string; filter_mode?: string; prefixes?: string };
  }>('/api/stats/operators', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const operators = await getOperatorStats(hours, request.query.gateway_id, deviceFilter);
    return { operators };
  });

  // Get recent packets for live stream initial load
  fastify.get<{
    Querystring: { limit?: string; gateway_id?: string; filter_mode?: string; prefixes?: string; packet_types?: string; dev_addr?: string; hours?: string; rssi_min?: string; rssi_max?: string };
  }>('/api/packets/recent', async (request) => {
    const limit = parseInt(request.query.limit ?? '100', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const packetTypes = request.query.packet_types ? request.query.packet_types.split(',') : undefined;
    const devAddr = request.query.dev_addr;
    const hours = request.query.hours ? parseInt(request.query.hours, 10) : undefined;
    const rssiMin = request.query.rssi_min ? parseInt(request.query.rssi_min, 10) : undefined;
    const rssiMax = request.query.rssi_max ? parseInt(request.query.rssi_max, 10) : undefined;
    const packets = await getRecentPackets(limit, request.query.gateway_id, deviceFilter, packetTypes, devAddr, hours, rssiMin, rssiMax);
    // Enrich with device metadata (name, dev_eui for uplinks)
    const cache = getMetadataCache();
    if (cache) {
      for (const p of packets) {
        if (p.dev_addr) {
          const meta = cache.getByDevAddr(p.dev_addr);
          if (meta) {
            (p as any).device_name = meta.device_name;
            if (!p.dev_eui && meta.dev_eui) (p as any).dev_eui = meta.dev_eui;
          }
        }
      }
    }
    return { packets };
  });

  // Get time series data for charts
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      interval?: string;
      metric?: string;
      group_by?: string;
      gateway_id?: string;
      filter_mode?: string;
      prefixes?: string;
    };
  }>('/api/stats/timeseries', async (request) => {
    const {
      from,
      to,
      interval = '1h',
      metric = 'packets',
      group_by,
      gateway_id,
      filter_mode = 'all',
      prefixes,
    } = request.query;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const deviceFilter = parseDeviceFilter(filter_mode, prefixes);

    const data = await getTimeSeries({
      from: fromDate,
      to: toDate,
      interval,
      metric: metric as 'packets' | 'airtime',
      groupBy: group_by as 'gateway' | 'operator' | undefined,
      gatewayId: gateway_id,
      deviceFilter,
    });

    return { data };
  });

  // Get duty cycle stats (all gateways)
  fastify.get<{
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string; gateway_id?: string };
  }>('/api/stats/duty-cycle', async (request) => {
    const hours = parseInt(request.query.hours ?? '1', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const stats = await getDutyCycleStats(request.query.gateway_id || null, hours, deviceFilter);
    return { stats };
  });

  // Get duty cycle stats for a gateway (legacy endpoint)
  fastify.get<{
    Params: { gatewayId: string };
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string };
  }>('/api/spectrum/:gatewayId/duty-cycle', async (request) => {
    const hours = parseInt(request.query.hours ?? '1', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const stats = await getDutyCycleStats(request.params.gatewayId, hours, deviceFilter);
    return { stats };
  });

  // Get channel distribution (all gateways or specific)
  fastify.get<{
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string; gateway_id?: string };
  }>('/api/stats/channels', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const channels = await getChannelDistribution(request.query.gateway_id || null, hours, deviceFilter);
    return { channels };
  });

  // Get spreading factor distribution (all gateways or specific)
  fastify.get<{
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string; gateway_id?: string };
  }>('/api/stats/spreading-factors', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const spreadingFactors = await getSFDistribution(request.query.gateway_id || null, hours, deviceFilter);
    return { spreadingFactors };
  });

  // Get channel distribution for a gateway (legacy endpoint)
  fastify.get<{
    Params: { gatewayId: string };
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string };
  }>('/api/spectrum/:gatewayId/channels', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const channels = await getChannelDistribution(request.params.gatewayId, hours, deviceFilter);
    return { channels };
  });

  // Get spreading factor distribution for a gateway (legacy endpoint)
  fastify.get<{
    Params: { gatewayId: string };
    Querystring: { hours?: string; filter_mode?: string; prefixes?: string };
  }>('/api/spectrum/:gatewayId/spreading-factors', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const filterMode = request.query.filter_mode || 'all';
    const deviceFilter = parseDeviceFilter(filterMode, request.query.prefixes);
    const spreadingFactors = await getSFDistribution(request.params.gatewayId, hours, deviceFilter);
    return { spreadingFactors };
  });

  // Get downlink and tx_ack stats
  fastify.get<{
    Querystring: { hours?: string; gateway_id?: string };
  }>('/api/stats/downlinks', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const stats = await getDownlinkStats(request.query.gateway_id || null, hours);
    return { stats };
  });
}
