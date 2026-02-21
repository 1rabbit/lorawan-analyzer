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

  // Ensure TTL is set on existing tables (CREATE TABLE IF NOT EXISTS skips this for pre-existing tables)
  try {
    await client.command({
      query: `ALTER TABLE packets MODIFY TTL timestamp + INTERVAL 7 DAY`,
    });
    console.log('  Applied 7-day TTL to packets table');
  } catch {
    // Ignore if already set to the same value
  }

  // Note: gateways, custom_operators, and hide_rules tables are now in SQLite

  // Create materialized view target tables
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS packets_hourly (
        hour             DateTime,
        gateway_id       LowCardinality(String),
        operator         LowCardinality(String),
        packet_type      LowCardinality(String),
        packet_count     AggregateFunction(count),
        airtime_us_sum   AggregateFunction(sum, UInt32),
        dev_addr_set     AggregateFunction(uniq, Nullable(String))
      )
      ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (hour, gateway_id, operator, packet_type)
      TTL hour + INTERVAL 7 DAY
    `,
  });
  console.log('  Created packets_hourly table');

  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS packets_channel_sf_hourly (
        hour             DateTime,
        gateway_id       LowCardinality(String),
        frequency        UInt32,
        spreading_factor UInt8,
        packet_count     AggregateFunction(count),
        airtime_us_sum   AggregateFunction(sum, UInt32)
      )
      ENGINE = AggregatingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (hour, gateway_id, frequency, spreading_factor)
      TTL hour + INTERVAL 7 DAY
    `,
  });
  console.log('  Created packets_channel_sf_hourly table');

  // Create materialized views (only fires on new inserts going forward)
  let hourlyMvCreated = false;
  try {
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS packets_hourly_mv
        TO packets_hourly AS
        SELECT
          toStartOfHour(timestamp) as hour,
          gateway_id,
          operator,
          packet_type,
          countState() as packet_count,
          sumState(airtime_us) as airtime_us_sum,
          uniqState(dev_addr) as dev_addr_set
        FROM packets
        GROUP BY hour, gateway_id, operator, packet_type
      `,
    });
    console.log('  Created packets_hourly_mv materialized view');
    hourlyMvCreated = true;
  } catch (err) {
    console.warn('  Could not create packets_hourly_mv:', err);
  }

  let channelMvCreated = false;
  try {
    await client.command({
      query: `
        CREATE MATERIALIZED VIEW IF NOT EXISTS packets_channel_sf_hourly_mv
        TO packets_channel_sf_hourly AS
        SELECT
          toStartOfHour(timestamp) as hour,
          gateway_id,
          frequency,
          coalesce(spreading_factor, 0) as spreading_factor,
          countState() as packet_count,
          sumState(airtime_us) as airtime_us_sum
        FROM packets
        GROUP BY hour, gateway_id, frequency, spreading_factor
      `,
    });
    console.log('  Created packets_channel_sf_hourly_mv materialized view');
    channelMvCreated = true;
  } catch (err) {
    console.warn('  Could not create packets_channel_sf_hourly_mv:', err);
  }

  // Backfill historical data into MV target tables if they are empty
  if (hourlyMvCreated) {
    try {
      const countResult = await client.query({
        query: `SELECT count() as c FROM packets_hourly`,
        format: 'JSONEachRow',
      });
      const countRows = await countResult.json<{ c: number }>();
      if ((countRows[0]?.c ?? 0) === 0) {
        console.log('  Backfilling packets_hourly from raw packets...');
        await client.command({
          query: `
            INSERT INTO packets_hourly
            SELECT
              toStartOfHour(timestamp) as hour,
              gateway_id,
              operator,
              packet_type,
              countState() as packet_count,
              sumState(airtime_us) as airtime_us_sum,
              uniqState(dev_addr) as dev_addr_set
            FROM packets
            GROUP BY hour, gateway_id, operator, packet_type
          `,
        });
        console.log('  Backfill of packets_hourly complete');
      }
    } catch (err) {
      console.warn('  packets_hourly backfill failed (non-fatal):', err);
    }
  }

  if (channelMvCreated) {
    try {
      const countResult = await client.query({
        query: `SELECT count() as c FROM packets_channel_sf_hourly`,
        format: 'JSONEachRow',
      });
      const countRows = await countResult.json<{ c: number }>();
      if ((countRows[0]?.c ?? 0) === 0) {
        console.log('  Backfilling packets_channel_sf_hourly from raw packets...');
        await client.command({
          query: `
            INSERT INTO packets_channel_sf_hourly
            SELECT
              toStartOfHour(timestamp) as hour,
              gateway_id,
              frequency,
              coalesce(spreading_factor, 0) as spreading_factor,
              countState() as packet_count,
              sumState(airtime_us) as airtime_us_sum
            FROM packets
            GROUP BY hour, gateway_id, frequency, spreading_factor
          `,
        });
        console.log('  Backfill of packets_channel_sf_hourly complete');
      }
    } catch (err) {
      console.warn('  packets_channel_sf_hourly backfill failed (non-fatal):', err);
    }
  }

  console.log('Migrations complete');
}
