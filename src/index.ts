import { loadConfig } from './config.js';
import { initClickHouse, closeClickHouse } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { insertPacket, upsertGateway, getCustomOperators } from './db/queries.js';
import { connectMqtt, onPacket, onDeviceMetadata, disconnectMqtt } from './mqtt/consumer.js';
import { initOperatorPrefixes } from './operators/prefixes.js';
import { startApi } from './api/index.js';
import { SessionTracker } from './session/tracker.js';
import { DeviceMetadataCache } from './metadata/cache.js';
import { GatewaySync } from './metadata/gateway-sync.js';
import type { ParsedPacket, MyDeviceRange, OperatorMapping } from './types.js';

const CONFIG_PATH = process.env.CONFIG_PATH ?? './config.toml';

function buildKnownDeviceRanges(operators: OperatorMapping[]): MyDeviceRange[] {
  const ranges: MyDeviceRange[] = [];

  for (const op of operators) {
    if (!op.known_devices) continue;
    const prefixes = Array.isArray(op.prefix) ? op.prefix : [op.prefix];
    for (const prefix of prefixes) {
      ranges.push({
        type: 'dev_addr',
        prefix,
        description: op.name,
      });
    }
  }

  return ranges;
}

async function main(): Promise<void> {
  console.log('LoRaWAN Analyzer starting...');

  // Load configuration
  const config = loadConfig(CONFIG_PATH);
  console.log('Configuration loaded');

  // Initialize ClickHouse
  initClickHouse(config.clickhouse);
  console.log(`ClickHouse client initialized: ${config.clickhouse.url}`);

  // Run migrations
  await runMigrations();

  // Load custom operators from DB and config
  const dbOperators = await getCustomOperators();
  const allOperators = [...dbOperators, ...config.operators];
  initOperatorPrefixes(allOperators);
  console.log(`Loaded ${allOperators.length} custom operator mappings`);

  // Initialize device metadata cache
  const metadataCache = new DeviceMetadataCache();
  await metadataCache.loadFromDatabase();
  console.log(`Device metadata cache loaded: ${metadataCache.size} devices`);

  // Initialize session tracker
  const sessionTracker = new SessionTracker();
  sessionTrackerRef = sessionTracker;

  // Connect to MQTT (non-blocking, auto-reconnects)
  connectMqtt(config.mqtt);

  // Register device metadata handler (from application MQTT topics)
  onDeviceMetadata(async (metadata) => {
    try {
      await metadataCache.upsert(metadata);
      console.log(`[metadata] ${metadata.dev_addr} -> ${metadata.device_name} (${metadata.application_name})`);
    } catch (err) {
      console.error('Error updating device metadata:', err);
    }
  });

  // Handle incoming packets
  onPacket(async (packet: ParsedPacket) => {
    try {
      // Enrich packet with session tracking
      const sessionResult = sessionTracker.processPacket(packet);
      if (sessionResult.session_id) {
        packet.session_id = sessionResult.session_id;
      }
      if (sessionResult.dev_eui && !packet.dev_eui) {
        packet.dev_eui = sessionResult.dev_eui;
      }

      // Insert packet into database
      await insertPacket(packet);

      // Update gateway
      await upsertGateway(packet.gateway_id);

      // Log packet info
      let info: string;
      let logLine: string;

      if (packet.packet_type === 'data') {
        info = `DevAddr=${packet.dev_addr} FCnt=${packet.f_cnt} FPort=${packet.f_port}`;
        logLine = `[${packet.gateway_id}] ${packet.packet_type.padEnd(12)} | ${info} | ` +
          `${packet.operator} | SF${packet.spreading_factor} | ` +
          `RSSI=${packet.rssi}dBm SNR=${packet.snr.toFixed(1)}dB | ` +
          `${(packet.airtime_us / 1000).toFixed(2)}ms`;
      } else if (packet.packet_type === 'downlink') {
        info = `DevAddr=${packet.dev_addr ?? 'N/A'} | DL_ID=${packet.f_cnt ?? 'N/A'}`;
        logLine = `[${packet.gateway_id}] ${packet.packet_type.padEnd(12)} | ${info} | ` +
          `${packet.operator} | SF${packet.spreading_factor} | TX | ` +
          `${(packet.airtime_us / 1000).toFixed(2)}ms`;
      } else if (packet.packet_type === 'tx_ack') {
        // packet.operator contains the status name, packet.f_cnt contains downlink_id
        info = `DL_ID=${packet.f_cnt ?? 'N/A'} | Status=${packet.operator}`;
        logLine = `[${packet.gateway_id}] ${packet.packet_type.padEnd(12)} | ${info}`;
      } else {
        info = `JoinEUI=${packet.join_eui} DevEUI=${packet.dev_eui}`;
        logLine = `[${packet.gateway_id}] ${packet.packet_type.padEnd(12)} | ${info} | ` +
          `${packet.operator} | SF${packet.spreading_factor} | ` +
          `RSSI=${packet.rssi}dBm SNR=${packet.snr.toFixed(1)}dB`;
      }

      console.log(logLine);
    } catch (err) {
      console.error('Error processing packet:', err);
    }
  });

  // Build known device ranges from operators with known_devices = true
  const myDeviceRanges = buildKnownDeviceRanges(config.operators);
  console.log(`Known device ranges: ${myDeviceRanges.length} prefixes`);
  if (myDeviceRanges.length > 0) {
    console.log('Known device prefixes:', myDeviceRanges.map(r => r.prefix).join(', '));
  }

  // Optional: Start gateway name sync from ChirpStack API
  if (config.chirpstack_api) {
    gatewaySyncRef = new GatewaySync(config.chirpstack_api, async (gatewayId, name) => {
      await upsertGateway(gatewayId, name);
      console.log(`[gateway-sync] ${gatewayId} -> ${name}`);
    });
    await gatewaySyncRef.start();
    console.log('ChirpStack gateway sync started');
  }

  // Start API server
  await startApi(config.api, myDeviceRanges, allOperators, metadataCache);

  console.log('LoRaWAN Analyzer running');

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

let sessionTrackerRef: SessionTracker | null = null;
let gatewaySyncRef: GatewaySync | null = null;

async function shutdown(): Promise<void> {
  console.log('\nShutting down...');

  try {
    sessionTrackerRef?.stopCleanup();
    gatewaySyncRef?.stop();
    await disconnectMqtt();
    await closeClickHouse();
  } catch (err) {
    console.error('Error during shutdown:', err);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
