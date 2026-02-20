import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ApiConfig, MyDeviceRange, OperatorMapping } from '../types.js';
import { gatewayRoutes } from './gateways.js';
import { deviceRoutes } from './devices.js';
import { statsRoutes } from './stats.js';
import { operatorRoutes } from './operators.js';
import { configRoutes, setMyDeviceRanges, setOperatorColors } from './config.js';
import { addLiveClient, startLiveBroadcast } from '../websocket/live.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In Docker: /app/public, in dev: relative to dist
const publicDir = process.env.NODE_ENV === 'production'
  ? '/app/public'
  : join(__dirname, '../../public');

export async function startApi(config: ApiConfig, myDevices: MyDeviceRange[] = [], operators: OperatorMapping[] = []): Promise<void> {
  setMyDeviceRanges(myDevices);
  setOperatorColors(operators);
  const fastify = Fastify({
    logger: false,
  });

  // Register WebSocket support
  await fastify.register(fastifyWebsocket);

  // Serve static files
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // Register API routes
  await fastify.register(gatewayRoutes);
  await fastify.register(deviceRoutes);
  await fastify.register(statsRoutes);
  await fastify.register(operatorRoutes);
  await fastify.register(configRoutes);

  // Parse WS filter params shared by both live endpoints
  function parseLiveFilters(query: { types?: string; rssi_min?: string; rssi_max?: string; filter_mode?: string; prefixes?: string; search?: string; gateway_ids?: string }) {
    const packetTypes = query.types ? query.types.split(',') : null;
    const rssiMin = query.rssi_min ? parseInt(query.rssi_min, 10) : null;
    const rssiMax = query.rssi_max ? parseInt(query.rssi_max, 10) : null;
    const filterMode = query.filter_mode && query.filter_mode !== 'all' ? query.filter_mode : null;
    const prefixes = query.prefixes ? query.prefixes.split(',').map(p => {
      const [prefixHex, bitsStr] = p.split('/');
      const bits = parseInt(bitsStr || '32', 10);
      const prefix = parseInt(prefixHex, 16);
      const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
      return { prefix: (prefix & mask) >>> 0, mask };
    }) : [];
    const search = query.search && query.search.trim() ? query.search.trim() : null;
    const gatewayIds = query.gateway_ids ? query.gateway_ids.split(',').filter(Boolean) : null;
    return { packetTypes, rssiMin, rssiMax, filterMode, prefixes, search, gatewayIds };
  }

  // WebSocket live feed - all gateways
  fastify.get<{ Querystring: { types?: string; rssi_min?: string; rssi_max?: string; filter_mode?: string; prefixes?: string; search?: string; gateway_ids?: string } }>('/api/live', { websocket: true }, (socket, request) => {
    const f = parseLiveFilters(request.query);
    addLiveClient(socket, null, f.packetTypes, f.rssiMin, f.rssiMax, f.filterMode, f.prefixes, f.search, f.gatewayIds);
  });

  // WebSocket live feed - specific gateway
  fastify.get<{ Params: { id: string }; Querystring: { types?: string; rssi_min?: string; rssi_max?: string; filter_mode?: string; prefixes?: string; search?: string; gateway_ids?: string } }>('/api/live/:id', { websocket: true }, (socket, request) => {
    const f = parseLiveFilters(request.query);
    addLiveClient(socket, request.params.id, f.packetTypes, f.rssiMin, f.rssiMax, f.filterMode, f.prefixes, f.search, f.gatewayIds);
  });

  // Start live broadcast
  startLiveBroadcast();

  // Parse bind address
  const [host, portStr] = config.bind.split(':');
  const port = parseInt(portStr, 10);

  await fastify.listen({ host, port });
  console.log(`API server listening on ${config.bind}`);
}
