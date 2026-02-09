import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import type { MqttConfig, ParsedPacket, DeviceMetadata, LastPayload } from '../types.js';
import { parseUplinkFrame, parseProtobufUplink } from '../parser/uplink.js';
import { parseDownlinkFrame, parseProtobufDownlink } from '../parser/downlink.js';
import { parseTxAck, parseProtobufTxAck } from '../parser/txack.js';

type PacketHandler = (packet: ParsedPacket) => void;
type MetadataHandler = (metadata: DeviceMetadata) => void;

let client: MqttClient | null = null;
let currentServer: string | null = null;
let packetHandlers: PacketHandler[] = [];
let metadataHandlers: MetadataHandler[] = [];

export function onPacket(handler: PacketHandler): void {
  packetHandlers.push(handler);
}

export function removePacketHandler(handler: PacketHandler): void {
  packetHandlers = packetHandlers.filter(h => h !== handler);
}

export function onDeviceMetadata(handler: MetadataHandler): void {
  metadataHandlers.push(handler);
}

export function connectMqtt(config: MqttConfig): MqttClient {
  const options: IClientOptions = {
    username: config.username || undefined,
    password: config.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  };

  console.log(`Connecting to MQTT broker: ${config.server}`);
  currentServer = config.server;
  client = mqtt.connect(config.server, options);

  client.on('connect', () => {
    console.log('MQTT connected');

    // Subscribe to all gateway events using wildcard
    // Derive base topic from config (e.g., eu868/gateway/+/event/up -> eu868/gateway/+)
    const baseTopic = config.topic.replace(/\/event\/up$/, '');
    const topics = [
      `${baseTopic}/event/up`,      // Uplinks
      `${baseTopic}/event/ack`,     // TX acknowledgements (confirms downlink TX)
      `${baseTopic}/command/down`,  // Downlink commands (scheduled TX)
    ];

    for (const topic of topics) {
      client!.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`MQTT subscribe error for ${topic}:`, err);
        } else {
          console.log(`Subscribed to: ${topic}`);
        }
      });
    }

    // Subscribe to application-level integration topics (if configured)
    if (config.application_topic) {
      client!.subscribe(config.application_topic, { qos: 0 }, (err) => {
        if (err) {
          console.error(`MQTT subscribe error for ${config.application_topic}:`, err);
        } else {
          console.log(`Subscribed to application topic: ${config.application_topic}`);
        }
      });
    }
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

function handleMessage(topic: string, message: Buffer, format: 'protobuf' | 'json'): void {
  // Check if this is an application integration topic
  if (topic.startsWith('application/')) {
    handleApplicationMessage(topic, message);
    return;
  }

  // Extract gateway ID from topic
  // Topic format: eu868/gateway/{gateway_id}/event/up|ack or /command/down
  const parts = topic.split('/');
  const gatewayIdx = parts.indexOf('gateway');
  if (gatewayIdx === -1 || gatewayIdx + 1 >= parts.length) {
    console.warn('Could not extract gateway ID from topic:', topic);
    return;
  }

  const gatewayIdFromTopic = parts[gatewayIdx + 1];
  const eventType = getEventType(topic);
  const timestamp = new Date();
  let packet: ParsedPacket | null = null;

  try {
    switch (eventType) {
      case 'up':
        // Uplink frame from device
        if (format === 'json') {
          const frame = JSON.parse(message.toString());
          packet = parseUplinkFrame(frame, timestamp);
        } else {
          packet = parseProtobufUplink(message, timestamp);
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
      // Emit to all handlers
      for (const handler of packetHandlers) {
        try {
          handler(packet);
        } catch (err) {
          console.error('Packet handler error:', err);
        }
      }
    }
  } catch (err) {
    console.error(`Error parsing ${eventType} message:`, err);
  }
}

function handleApplicationMessage(topic: string, message: Buffer): void {
  try {
    const data = JSON.parse(message.toString());
    if (!data.deviceInfo) return;

    const info = data.deviceInfo;
    const devAddr = data.devAddr || null;
    if (!devAddr) return;

    // Extract last payload if present (uplink events)
    let lastPayload: LastPayload | undefined;
    if (data.data || data.object) {
      lastPayload = {
        f_cnt: data.fCnt ?? 0,
        f_port: data.fPort ?? 0,
        raw_base64: data.data || '',
        decoded: data.object || null,
        timestamp: new Date(),
      };
    }

    const metadata: DeviceMetadata = {
      dev_addr: devAddr.toUpperCase(),
      dev_eui: (info.devEui || '').toUpperCase(),
      device_name: info.deviceName || '',
      application_name: info.applicationName || '',
      device_profile_name: info.deviceProfileName || '',
      last_seen: new Date(),
      last_payload: lastPayload,
    };

    for (const handler of metadataHandlers) {
      try {
        handler(metadata);
      } catch (err) {
        console.error('Metadata handler error:', err);
      }
    }
  } catch (err) {
    // Silently ignore parse errors for non-JSON messages
  }
}

export function getMqttStatus(): { connected: boolean; server: string | null } {
  return {
    connected: client?.connected ?? false,
    server: currentServer,
  };
}

export function getMqttClient(): MqttClient | null {
  return client;
}

export async function disconnectMqtt(): Promise<void> {
  if (client) {
    await new Promise<void>((resolve) => {
      client!.end(false, {}, () => {
        client = null;
        currentServer = null;
        resolve();
      });
    });
  }
}
