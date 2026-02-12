import type { WebSocket } from '@fastify/websocket';
import type { ParsedPacket, LivePacket } from '../types.js';
import { onPacket, removePacketHandler } from '../mqtt/consumer.js';
import { getMetadataCache } from '../api/index.js';

interface DevicePrefix {
  prefix: number;
  mask: number;
}

interface LiveClient {
  ws: WebSocket;
  gatewayId: string | null;  // null = all gateways
  packetTypes: Set<string> | null;  // null = all types
  rssiMin: number | null;
  rssiMax: number | null;
  filterMode: string | null;  // 'owned' | 'foreign' | null (all)
  prefixes: DevicePrefix[];
}

const clients: Set<LiveClient> = new Set();

export function addLiveClient(
  ws: WebSocket,
  gatewayId: string | null,
  packetTypes: string[] | null = null,
  rssiMin: number | null = null,
  rssiMax: number | null = null,
  filterMode: string | null = null,
  prefixes: DevicePrefix[] = [],
): void {
  const client: LiveClient = {
    ws,
    gatewayId,
    packetTypes: packetTypes ? new Set(packetTypes) : null,
    rssiMin,
    rssiMax,
    filterMode,
    prefixes,
  };
  clients.add(client);

  ws.on('close', () => {
    clients.delete(client);
  });

  ws.on('error', () => {
    clients.delete(client);
  });
}

function matchesDeviceFilter(devAddr: string | null, filterMode: string | null, prefixes: DevicePrefix[]): boolean {
  if (!filterMode || prefixes.length === 0) return true;

  // Non-data packets always pass
  if (!devAddr) return true;

  const addrNum = parseInt(devAddr, 16);
  const isOwned = prefixes.some(p => (addrNum & p.mask) === (p.prefix & p.mask));

  if (filterMode === 'owned') return isOwned;
  if (filterMode === 'foreign') return !isOwned;
  return true;
}

export function broadcastPacket(packet: ParsedPacket): void {
  const livePacket = convertToLivePacket(packet);
  const message = JSON.stringify(livePacket);

  for (const client of clients) {
    // Filter by gateway if specified
    if (client.gatewayId && client.gatewayId !== packet.gateway_id) {
      continue;
    }

    // Filter by packet type if specified
    if (client.packetTypes && !client.packetTypes.has(packet.packet_type)) {
      continue;
    }

    // RSSI filter (skip downlink/tx_ack which have no RSSI)
    if ((packet.packet_type === 'data' || packet.packet_type === 'join_request') && packet.rssi != null) {
      if (client.rssiMin != null && packet.rssi < client.rssiMin) continue;
      if (client.rssiMax != null && packet.rssi > client.rssiMax) continue;
    }

    // Device ownership filter (only for data/downlink)
    if (packet.packet_type === 'data' || packet.packet_type === 'downlink') {
      if (!matchesDeviceFilter(packet.dev_addr, client.filterMode, client.prefixes)) {
        continue;
      }
    }

    try {
      if (client.ws.readyState === 1) {  // OPEN
        client.ws.send(message);
      }
    } catch {
      // Client disconnected
      clients.delete(client);
    }
  }
}

function convertToLivePacket(packet: ParsedPacket): LivePacket {
  const dataRate = packet.spreading_factor && packet.bandwidth
    ? `SF${packet.spreading_factor}BW${packet.bandwidth / 1000}`
    : 'Unknown';

  const base: LivePacket = {
    timestamp: packet.timestamp.getTime(),
    gateway_id: packet.gateway_id,
    type: packet.packet_type,
    operator: packet.operator,
    data_rate: dataRate,
    frequency: packet.frequency / 1_000_000,  // Convert to MHz
    snr: packet.snr,
    rssi: packet.rssi,
    payload_size: packet.payload_size,
    airtime_ms: packet.airtime_us / 1000,
  };

  // Enrich with device metadata from cache
  const metadata = packet.dev_addr ? getMetadataCache()?.getByDevAddr(packet.dev_addr) : null;
  if (metadata) {
    base.device_name = metadata.device_name;
    if (metadata.dev_eui) base.dev_eui = metadata.dev_eui;
  }

  if (packet.packet_type === 'data' || packet.packet_type === 'downlink') {
    return {
      ...base,
      dev_addr: packet.dev_addr ?? undefined,
      f_cnt: packet.f_cnt ?? undefined,
      f_port: packet.f_port ?? undefined,
      confirmed: packet.confirmed ?? undefined,
    };
  } else if (packet.packet_type === 'tx_ack') {
    return {
      ...base,
      tx_status: packet.operator,  // Status name is stored in operator field
      f_cnt: packet.f_cnt ?? undefined,  // downlink_id for correlation
    };
  } else {
    return {
      ...base,
      join_eui: packet.join_eui ?? undefined,
      dev_eui: packet.dev_eui ?? undefined,
    };
  }
}

// Handler for broadcasting packets to WebSocket clients
let broadcastHandler: ((packet: ParsedPacket) => void) | null = null;

export function startLiveBroadcast(): void {
  if (broadcastHandler) return;

  broadcastHandler = (packet) => {
    broadcastPacket(packet);
  };

  onPacket(broadcastHandler);
}

export function stopLiveBroadcast(): void {
  if (broadcastHandler) {
    removePacketHandler(broadcastHandler);
    broadcastHandler = null;
  }
}

export function getClientCount(): number {
  return clients.size;
}
