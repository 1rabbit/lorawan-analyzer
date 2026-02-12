import { loadConfig } from './config.js';
import { initClickHouse, closeClickHouse } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { insertPacket, upsertGateway, getCustomOperators } from './db/queries.js';
import { connectMqtt, onPacket, onGatewayLocation, disconnectMqtt } from './mqtt/consumer.js';
import { initOperatorPrefixes } from './operators/prefixes.js';
import { startApi } from './api/index.js';
import { SessionTracker } from './session/tracker.js';
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

  // Initialize session tracker
  const sessionTracker = new SessionTracker();
  sessionTrackerRef = sessionTracker;

  // Connect to MQTT (non-blocking, auto-reconnects)
  connectMqtt(config.mqtt);

  // Handle incoming packets
  onPacket(async (packet: ParsedPacket, gatewayLocation) => {
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

      // Update gateway (with location and name if available from uplink metadata)
      await upsertGateway(packet.gateway_id, gatewayLocation?.name ?? null, gatewayLocation);

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

  // Handle gateway location updates from application-level MQTT messages
  onGatewayLocation(async (gatewayId, location) => {
    try {
      await upsertGateway(gatewayId, location.name ?? null, location);
    } catch (err) {
      console.error('Error updating gateway location:', err);
    }
  });

  // Build known device ranges from operators with known_devices = true
  const myDeviceRanges = buildKnownDeviceRanges(config.operators);
  console.log(`Known device ranges: ${myDeviceRanges.length} prefixes`);
  if (myDeviceRanges.length > 0) {
    console.log('Known device prefixes:', myDeviceRanges.map(r => r.prefix).join(', '));
  }

  // Start API server
  await startApi(config.api, myDeviceRanges, allOperators);

  console.log('LoRaWAN Analyzer running');

  // Handle shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

let sessionTrackerRef: SessionTracker | null = null;

async function shutdown(): Promise<void> {
  console.log('\nShutting down...');

  try {
    sessionTrackerRef?.stopCleanup();
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
