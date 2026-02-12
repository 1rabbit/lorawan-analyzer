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

  // Create gateways table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS gateways (
        gateway_id String,
        name Nullable(String),
        first_seen DateTime64(3),
        last_seen DateTime64(3)
      )
      ENGINE = ReplacingMergeTree(last_seen)
      ORDER BY gateway_id
    `,
  });
  console.log('  Created gateways table');

  // Create custom_operators table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS custom_operators (
        id UInt32,
        prefix String,
        name String,
        priority Int16 DEFAULT 0
      )
      ENGINE = MergeTree()
      ORDER BY id
    `,
  });
  console.log('  Created custom_operators table');

  // Create hide_rules table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS hide_rules (
        id UInt32,
        rule_type LowCardinality(String),
        prefix String,
        description Nullable(String)
      )
      ENGINE = MergeTree()
      ORDER BY id
    `,
  });
  console.log('  Created hide_rules table');

  // Create device_metadata table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS device_metadata (
        dev_addr String,
        dev_eui String,
        device_name String,
        application_name String,
        device_profile_name String,
        last_seen DateTime64(3)
      )
      ENGINE = ReplacingMergeTree(last_seen)
      ORDER BY dev_addr
    `,
  });
  console.log('  Created device_metadata table');

  // Create settings table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS settings (
        key String,
        value String,
        updated_at DateTime64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY key
    `,
  });
  console.log('  Created settings table');

  // Create import_profiles table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS import_profiles (
        id String,
        name String,
        required_tags Array(String),
        created_at DateTime64(3),
        updated_at DateTime64(3),
        deleted UInt8 DEFAULT 0
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
    `,
  });
  console.log('  Created import_profiles table');

  // Create chirpstack_servers table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS chirpstack_servers (
        id String,
        name String,
        url String,
        created_at DateTime64(3),
        updated_at DateTime64(3),
        deleted UInt8 DEFAULT 0
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
    `,
  });
  console.log('  Created chirpstack_servers table');

  console.log('Migrations complete');
}
