import { getClickHouse } from './index.js';

export async function runMigrations(): Promise<void> {
  const client = getClickHouse();

  console.log('Running database migrations...');

  // Create packets table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS packets (
        timestamp DateTime64(3),
        gateway_id LowCardinality(String),
        packet_type LowCardinality(String),
        dev_addr Nullable(String),
        join_eui Nullable(String),
        dev_eui Nullable(String),
        operator LowCardinality(String),
        frequency UInt32,
        spreading_factor Nullable(UInt8),
        bandwidth UInt32,
        rssi Int16,
        snr Float32,
        payload_size UInt16,
        airtime_us UInt32,
        f_cnt Nullable(UInt32),
        f_port Nullable(UInt8),
        confirmed Nullable(Bool) DEFAULT NULL,
        session_id Nullable(String) DEFAULT NULL
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMMDD(timestamp)
      ORDER BY (gateway_id, timestamp)
      TTL timestamp + INTERVAL 7 DAY
    `,
  });
  console.log('  Created packets table');

  // Add confirmed column if it doesn't exist (migration for existing tables)
  try {
    await client.command({
      query: `ALTER TABLE packets ADD COLUMN IF NOT EXISTS confirmed Nullable(Bool) DEFAULT NULL`,
    });
    console.log('  Added confirmed column to packets table');
  } catch {
    // Column might already exist or ALTER not supported - ignore
  }

  // Add session_id column if it doesn't exist (migration for existing tables)
  try {
    await client.command({
      query: `ALTER TABLE packets ADD COLUMN IF NOT EXISTS session_id Nullable(String) DEFAULT NULL`,
    });
    console.log('  Added session_id column to packets table');
  } catch {
    // Column might already exist - ignore
  }

  // Note: gateways, custom_operators, and hide_rules tables are now in SQLite

  console.log('Migrations complete');
}
