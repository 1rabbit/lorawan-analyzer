import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import type { MqttConfig, ParsedPacket } from '../types.js';
import { parseUplinkFrame, parseProtobufUplink, extractGatewayLocationFromJSON, extractGatewayLocationFromProtobuf, extractGatewayLocationsFromJSON } from '../parser/uplink.js';
import type { GatewayLocation } from '../parser/uplink.js';
import { parseDownlinkFrame, parseProtobufDownlink } from '../parser/downlink.js';
import { parseTxAck, parseProtobufTxAck } from '../parser/txack.js';

type PacketHandler = (packet: ParsedPacket, gatewayLocation?: GatewayLocation | null) => void;
type LocationHandler = (gatewayId: string, location: GatewayLocation) => void;

let client: MqttClient | null = null;
let packetHandlers: PacketHandler[] = [];
let locationHandlers: LocationHandler[] = [];

export function onPacket(handler: PacketHandler): void {
  packetHandlers.push(handler);
}

export function onGatewayLocation(handler: LocationHandler): void {
  locationHandlers.push(handler);
}

export function removePacketHandler(handler: PacketHandler): void {
  packetHandlers = packetHandlers.filter(h => h !== handler);
}

export function connectMqtt(config: MqttConfig): MqttClient {
  const options: IClientOptions = {
    username: config.username || undefined,
    password: config.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  };

  console.log(`Connecting to MQTT broker: ${config.server}`);
  client = mqtt.connect(config.server, options);

  client.on('connect', () => {
    console.log('MQTT connected');

    client!.subscribe(config.topic, { qos: 0 }, (err) => {
      if (err) {
        console.error(`MQTT subscribe error for ${config.topic}:`, err);
      } else {
        console.log(`Subscribed to: ${config.topic}`);
      }
    });
  });

  client.on('error', (err) => {
    console.error('MQTT error:', err.message);
  });

  client.on('reconnect', () => {
    console.log('MQTT reconnecting...');
  });

  client.on('message', (topic, message) => {
    handleMessage(topic, message, config.format);
  });

  return client;
}

type EventType = 'up' | 'ack' | 'down' | 'stats' | 'unknown';

function getEventType(topic: string): EventType {
  if (topic.includes('/event/up')) return 'up';
  if (topic.includes('/event/ack')) return 'ack';
  if (topic.includes('/command/down')) return 'down';
  if (topic.includes('/event/stats')) return 'stats';
  return 'unknown';
}

function isApplicationTopic(topic: string): boolean {
  return topic.includes('/application/') || topic.includes('application/');
}

function handleMessage(topic: string, message: Buffer, format: 'protobuf' | 'json'): void {
  // Application-level event/up: extract gateway locations only (don't parse packets to avoid duplicates)
  if (isApplicationTopic(topic) && getEventType(topic) === 'up') {
    handleApplicationUplink(message, format);
    return;
  }

  // Extract gateway ID from topic (e.g. eu868/gateway/{id}/event/up)
  const parts = topic.split('/');
  const gatewayIdx = parts.indexOf('gateway');
  if (gatewayIdx === -1 || gatewayIdx + 1 >= parts.length) {
    return; // Not a gateway topic, skip silently
  }

  const gatewayIdFromTopic = parts[gatewayIdx + 1];
  const eventType = getEventType(topic);
  const timestamp = new Date();
  let packet: ParsedPacket | null = null;
  let gatewayLocation: GatewayLocation | null = null;

  try {
    switch (eventType) {
      case 'up':
        // Uplink frame from device
        if (format === 'json') {
          const frame = JSON.parse(message.toString());
          packet = parseUplinkFrame(frame, timestamp);
          gatewayLocation = extractGatewayLocationFromJSON(frame);
        } else {
          packet = parseProtobufUplink(message, timestamp);
          gatewayLocation = extractGatewayLocationFromProtobuf(message);
        }
        break;

      case 'down':
        // Downlink command sent to gateway for TX
        if (format === 'json') {
          const frame = JSON.parse(message.toString());
          packet = parseDownlinkFrame(frame, timestamp, gatewayIdFromTopic);
        } else {
          packet = parseProtobufDownlink(message, timestamp, gatewayIdFromTopic);
        }
        break;

      case 'ack':
        // TX acknowledgement - confirms downlink was transmitted
        if (format === 'json') {
          const ack = JSON.parse(message.toString());
          packet = parseTxAck(ack, timestamp, gatewayIdFromTopic);
        } else {
          packet = parseProtobufTxAck(message, timestamp, gatewayIdFromTopic);
        }
        break;

      case 'stats':
        // Gateway stats - could be used for monitoring but not packet tracking
        // Skip for now
        break;

      default:
        console.warn('Unknown event type for topic:', topic);
    }

    if (packet) {
      if (gatewayLocation?.name) {
        packet.gateway_name = gatewayLocation.name;
      }

      // Emit to all handlers
      for (const handler of packetHandlers) {
        try {
          handler(packet, gatewayLocation);
        } catch (err) {
          console.error('Packet handler error:', err);
        }
      }
    }
  } catch (err) {
    console.error(`Error parsing ${eventType} message:`, err);
  }
}

function handleApplicationUplink(message: Buffer, format: 'protobuf' | 'json'): void {
  try {
    if (format === 'json') {
      const frame = JSON.parse(message.toString());
      const locations = extractGatewayLocationsFromJSON(frame);
      for (const [gwId, loc] of locations) {
        emitLocation(gwId, loc);
      }
    } else {
      // Protobuf: integration.UplinkEvent has rxInfo as repeated field 12
      const locations = decodeApplicationUplinkLocations(message);
      for (const [gwId, loc] of locations) {
        emitLocation(gwId, loc);
      }
    }
  } catch (err) {
    // Silently ignore parse errors for location extraction
  }
}

function emitLocation(gatewayId: string, location: GatewayLocation): void {
  for (const handler of locationHandlers) {
    try {
      handler(gatewayId, location);
    } catch (err) {
      console.error('Location handler error:', err);
    }
  }
}

// Decode rxInfo entries from integration.UplinkEvent protobuf
// Field 12: rxInfo (repeated UplinkRxInfo)
function decodeApplicationUplinkLocations(data: Buffer): Map<string, GatewayLocation> {
  const locations = new Map<string, GatewayLocation>();
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) { // Length-delimited
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      if (fieldNumber === 12) { // rxInfo entry
        const rxInfo = decodeRxInfoForLocation(fieldData);
        if (rxInfo.gatewayId && rxInfo.location && !locations.has(rxInfo.gatewayId)) {
          locations.set(rxInfo.gatewayId, rxInfo.location);
        }
      }
    } else if (wireType === 0) {
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else if (wireType === 5) {
      offset += 4;
    } else if (wireType === 1) {
      offset += 8;
    } else {
      break;
    }
  }

  return locations;
}

// Lightweight rxInfo decoder that only extracts gatewayId, location, and metadata
function decodeRxInfoForLocation(data: Buffer): { gatewayId?: string; location?: GatewayLocation } {
  const result: { gatewayId?: string; location?: GatewayLocation } = {};
  const metadata: Record<string, string> = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      if (fieldNumber === 1) { // gateway_id
        result.gatewayId = fieldData.toString('utf-8');
      } else if (fieldNumber === 12) { // location
        const loc = decodeLocationFromBuffer(fieldData);
        if (loc) result.location = loc;
      } else if (fieldNumber === 15) { // metadata map entry
        const entry = decodeMapEntryFromBuffer(fieldData);
        if (entry) metadata[entry[0]] = entry[1];
      }
    } else if (wireType === 0) {
      // Use BigInt reader to handle negative varints (rssi etc)
      const [, nextOffset] = readVarintBigInt(data, offset);
      offset = nextOffset;
    } else if (wireType === 5) {
      offset += 4;
    } else if (wireType === 1) {
      offset += 8;
    } else {
      break;
    }
  }

  // Fallback: Helium metadata
  if (!result.location && metadata.gateway_lat && metadata.gateway_long) {
    const lat = parseFloat(metadata.gateway_lat);
    const lng = parseFloat(metadata.gateway_long);
    if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
      result.location = { latitude: lat, longitude: lng };
    }
  }

  if (result.location && metadata.gateway_name) {
    result.location.name = metadata.gateway_name;
  }

  return result;
}

// Minimal protobuf decoders (duplicated to avoid circular deps with uplink.ts internals)
function readVarint(data: Buffer, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  while (offset < data.length) {
    const byte = data[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift >= 35) break;
  }
  return [value >>> 0, offset];
}

function readVarintBigInt(data: Buffer, offset: number): [bigint, number] {
  let value = BigInt(0);
  let shift = BigInt(0);
  while (offset < data.length) {
    const byte = data[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += BigInt(7);
  }
  return [value, offset];
}

function decodeLocationFromBuffer(data: Buffer): GatewayLocation | null {
  const loc = { latitude: 0, longitude: 0, altitude: 0 };
  let offset = 0;
  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 1) {
      const value = data.readDoubleLE(offset);
      offset += 8;
      if (fieldNumber === 1) loc.latitude = value;
      else if (fieldNumber === 2) loc.longitude = value;
      else if (fieldNumber === 3) loc.altitude = value;
    } else if (wireType === 0) {
      const [, next] = readVarint(data, offset);
      offset = next;
    } else if (wireType === 2) {
      const [len, lo] = readVarint(data, offset);
      offset = lo + len;
    } else if (wireType === 5) {
      offset += 4;
    } else { break; }
  }
  if (loc.latitude === 0 && loc.longitude === 0) return null;
  return loc;
}

function decodeMapEntryFromBuffer(data: Buffer): [string, string] | null {
  let key = '';
  let value = '';
  let offset = 0;
  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    if (wireType === 2) {
      const [len, lo] = readVarint(data, offset);
      offset = lo;
      const str = data.subarray(offset, offset + len).toString('utf-8');
      offset += len;
      if (fieldNumber === 1) key = str;
      else if (fieldNumber === 2) value = str;
    } else if (wireType === 0) {
      const [, next] = readVarint(data, offset);
      offset = next;
    } else { break; }
  }
  return key ? [key, value] : null;
}

export function getMqttClient(): MqttClient | null {
  return client;
}

export async function disconnectMqtt(): Promise<void> {
  if (client) {
    await new Promise<void>((resolve) => {
      client!.end(false, {}, () => {
        client = null;
        resolve();
      });
    });
  }
}
