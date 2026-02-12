import { getClickHouse } from './index.js';
import type {
  ParsedPacket,
  GatewayStats,
  OperatorStats,
  TimeSeriesPoint,
  DeviceProfile,
  TreeOperator,
  TreeDevice,
  FCntTimelinePoint,
  IntervalHistogram,
  SignalTrendPoint,
  DistributionItem,
  SpectrumStats,
  ChannelStats,
  SFStats,
  JoinEuiGroup,
  DeviceMetadata,
  ImportProfile,
  ChirpStackServer,
} from '../types.js';

export type DeviceFilter = {
  include?: Array<{ prefix: number; mask: number }>;
  exclude?: Array<{ prefix: number; mask: number }>;
};

function buildDeviceFilterSql(filter?: DeviceFilter): string {
  if (!filter) return '';

  const conditions: string[] = [];

  if (filter.include && filter.include.length > 0) {
    const includeConditions = filter.include.map((r) =>
      `(bitAnd(reinterpretAsUInt32(reverse(unhex(dev_addr))), ${r.mask >>> 0}) = ${r.prefix >>> 0})`
    );
    conditions.push(`(packet_type NOT IN ('data', 'downlink') OR dev_addr IS NULL OR dev_addr = '' OR (${includeConditions.join(' OR ')}))`);
  }

  if (filter.exclude && filter.exclude.length > 0) {
    const excludeConditions = filter.exclude.map((r) =>
      `(bitAnd(reinterpretAsUInt32(reverse(unhex(dev_addr))), ${r.mask >>> 0}) != ${r.prefix >>> 0})`
    );
    conditions.push(`(packet_type NOT IN ('data', 'downlink') OR dev_addr IS NULL OR dev_addr = '' OR (${excludeConditions.join(' AND ')}))`);
  }

  return conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';
}

export async function insertPacket(packet: ParsedPacket): Promise<void> {
  const client = getClickHouse();

  await client.insert({
    table: 'packets',
    values: [{
      timestamp: packet.timestamp.toISOString().replace('T', ' ').replace('Z', ''),
      gateway_id: packet.gateway_id,
      packet_type: packet.packet_type,
      dev_addr: packet.dev_addr,
      join_eui: packet.join_eui,
      dev_eui: packet.dev_eui,
      operator: packet.operator,
      frequency: packet.frequency,
      spreading_factor: packet.spreading_factor,
      bandwidth: packet.bandwidth,
      rssi: packet.rssi,
      snr: packet.snr,
      payload_size: packet.payload_size,
      airtime_us: packet.airtime_us,
      f_cnt: packet.f_cnt,
      f_port: packet.f_port,
      confirmed: packet.confirmed,
      session_id: packet.session_id ?? null,
    }],
    format: 'JSONEachRow',
  });
}

export async function upsertGateway(gatewayId: string, name: string | null = null): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  // Check if gateway exists (and get existing name to preserve it)
  const result = await client.query({
    query: `SELECT first_seen, name FROM gateways WHERE gateway_id = {gatewayId:String} ORDER BY last_seen DESC LIMIT 1`,
    query_params: { gatewayId },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ first_seen: string; name: string | null }>();

  if (rows.length === 0) {
    // Insert new gateway
    await client.insert({
      table: 'gateways',
      values: [{
        gateway_id: gatewayId,
        name,
        first_seen: now,
        last_seen: now,
      }],
      format: 'JSONEachRow',
    });
  } else {
    // Preserve existing name if no new name provided
    const resolvedName = name ?? rows[0].name;
    await client.insert({
      table: 'gateways',
      values: [{
        gateway_id: gatewayId,
        name: resolvedName,
        first_seen: rows[0].first_seen,
        last_seen: now,
      }],
      format: 'JSONEachRow',
    });
  }
}

export async function getGateways(): Promise<GatewayStats[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        gateway_id,
        argMax(g.name, g.last_seen) as name,
        min(first_seen) as first_seen,
        max(last_seen) as last_seen,
        COALESCE(p.packet_count, 0) as packet_count,
        COALESCE(p.unique_devices, 0) as unique_devices,
        COALESCE(p.total_airtime_us, 0) / 1000 as total_airtime_ms
      FROM gateways g
      LEFT JOIN (
        SELECT
          gateway_id,
          count() as packet_count,
          uniqExact(dev_addr) as unique_devices,
          sum(airtime_us) as total_airtime_us
        FROM packets
        WHERE timestamp > now() - INTERVAL 24 HOUR
        GROUP BY gateway_id
      ) p USING (gateway_id)
      GROUP BY gateway_id, p.packet_count, p.unique_devices, p.total_airtime_us
      ORDER BY packet_count DESC
    `,
    format: 'JSONEachRow',
  });

  return result.json<GatewayStats>();
}

export async function getGatewayById(gatewayId: string): Promise<GatewayStats | null> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        g.gateway_id,
        g.name,
        g.first_seen,
        g.last_seen,
        COALESCE(p.packet_count, 0) as packet_count,
        COALESCE(p.unique_devices, 0) as unique_devices,
        COALESCE(p.total_airtime_us, 0) / 1000 as total_airtime_ms
      FROM gateways FINAL g
      LEFT JOIN (
        SELECT
          gateway_id,
          count() as packet_count,
          uniqExact(dev_addr) as unique_devices,
          sum(airtime_us) as total_airtime_us
        FROM packets
        WHERE gateway_id = {gatewayId:String}
          AND timestamp > now() - INTERVAL 24 HOUR
        GROUP BY gateway_id
      ) p ON g.gateway_id = p.gateway_id
      WHERE g.gateway_id = {gatewayId:String}
    `,
    query_params: { gatewayId },
    format: 'JSONEachRow',
  });

  const rows = await result.json<GatewayStats>();
  return rows.length > 0 ? rows[0] : null;
}

export async function getGatewayOperators(gatewayId: string, hours: number = 24): Promise<OperatorStats[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        operator,
        count() as packet_count,
        uniqExact(dev_addr) as unique_devices,
        sum(airtime_us) / 1000 as total_airtime_ms
      FROM packets
      WHERE gateway_id = {gatewayId:String}
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
      GROUP BY operator
      ORDER BY packet_count DESC
    `,
    query_params: { gatewayId, hours },
    format: 'JSONEachRow',
  });

  return result.json<OperatorStats>();
}

export async function getGatewayDevices(
  gatewayId: string | null,
  hours: number = 24,
  limit: number = 100,
  rssiMin?: number,
  rssiMax?: number
): Promise<Array<{
  dev_addr: string;
  operator: string;
  packet_count: number;
  last_seen: string;
  avg_rssi: number;
  min_rssi: number;
  max_rssi: number;
  avg_snr: number;
  min_snr: number;
  max_snr: number;
  min_sf: number;
  max_sf: number;
  avg_interval_s: number;
  missed_packets: number;
  loss_percent: number;
}>> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId && gatewayId !== 'all'
    ? 'AND gateway_id = {gatewayId:String}'
    : '';

  const result = await client.query({
    query: `
      WITH fcnt_gaps AS (
        SELECT
          dev_addr,
          f_cnt,
          lagInFrame(f_cnt) OVER (PARTITION BY dev_addr, coalesce(session_id, '') ORDER BY timestamp) as prev_fcnt
        FROM packets
        WHERE packet_type = 'data'
          AND f_cnt IS NOT NULL
          AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
          ${gatewayFilter}
      ),
      loss_stats AS (
        SELECT
          dev_addr,
          sum(if(prev_fcnt IS NOT NULL AND f_cnt > prev_fcnt AND f_cnt - prev_fcnt > 1, f_cnt - prev_fcnt - 1, 0)) as missed
        FROM fcnt_gaps
        GROUP BY dev_addr
      )
      SELECT
        p.dev_addr,
        any(p.operator) as operator,
        count() as packet_count,
        max(p.timestamp) as last_seen,
        avg(p.rssi) as avg_rssi,
        min(p.rssi) as min_rssi,
        max(p.rssi) as max_rssi,
        avg(p.snr) as avg_snr,
        min(p.snr) as min_snr,
        max(p.snr) as max_snr,
        min(p.spreading_factor) as min_sf,
        max(p.spreading_factor) as max_sf,
        if(count() > 1,
          (toUnixTimestamp64Milli(max(p.timestamp)) - toUnixTimestamp64Milli(min(p.timestamp))) / 1000.0 / (count() - 1),
          0
        ) as avg_interval_s,
        coalesce(l.missed, 0) as missed_packets,
        if(count() + coalesce(l.missed, 0) > 0,
          coalesce(l.missed, 0) * 100.0 / (count() + coalesce(l.missed, 0)),
          0
        ) as loss_percent
      FROM packets p
      LEFT JOIN loss_stats l ON p.dev_addr = l.dev_addr
      WHERE p.packet_type = 'data'
        AND p.timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      GROUP BY p.dev_addr, l.missed
      ${rssiMin !== undefined || rssiMax !== undefined ? `HAVING ${rssiMin !== undefined ? 'avg(p.rssi) >= {rssiMin:Int32}' : '1=1'} AND ${rssiMax !== undefined ? 'avg(p.rssi) <= {rssiMax:Int32}' : '1=1'}` : ''}
      ORDER BY packet_count DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { gatewayId, hours, limit, rssiMin, rssiMax },
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function getDeviceActivity(
  devAddr: string,
  hours: number = 24,
  gatewayId: string | null = null
): Promise<Array<{
  timestamp: string;
  gateway_id: string;
  f_cnt: number | null;
  f_port: number | null;
  rssi: number;
  snr: number;
  spreading_factor: number | null;
  frequency: number;
  payload_size: number;
  airtime_us: number;
}>> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        gateway_id,
        f_cnt,
        f_port,
        rssi,
        snr,
        spreading_factor,
        frequency,
        payload_size,
        airtime_us
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      ORDER BY timestamp DESC
      LIMIT 1000
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function getDevicePacketLoss(
  devAddr: string,
  hours: number = 24,
  gatewayId: string | null = null
): Promise<{
  total_received: number;
  total_expected: number;
  total_missed: number;
  loss_percent: number;
  per_gateway: Array<{
    gateway_id: string;
    received: number;
    missed: number;
    loss_percent: number;
  }>;
}> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';

  // Get FCnt data with gaps per gateway
  const result = await client.query({
    query: `
      WITH ordered AS (
        SELECT
          gateway_id,
          f_cnt,
          lagInFrame(f_cnt) OVER (PARTITION BY gateway_id, coalesce(session_id, '') ORDER BY timestamp) as prev_fcnt
        FROM packets
        WHERE dev_addr = {devAddr:String}
          AND packet_type = 'data'
          AND f_cnt IS NOT NULL
          AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
          ${gatewayFilter}
      )
      SELECT
        gateway_id,
        count() as received,
        sum(if(prev_fcnt IS NOT NULL AND f_cnt > prev_fcnt AND f_cnt - prev_fcnt > 1, f_cnt - prev_fcnt - 1, 0)) as missed
      FROM ordered
      GROUP BY gateway_id
      ORDER BY received DESC
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  const perGateway = await result.json<{ gateway_id: string; received: number; missed: number }>();

  const totalReceived = perGateway.reduce((sum, g) => sum + g.received, 0);
  const totalMissed = perGateway.reduce((sum, g) => sum + g.missed, 0);
  const totalExpected = totalReceived + totalMissed;

  return {
    total_received: totalReceived,
    total_expected: totalExpected,
    total_missed: totalMissed,
    loss_percent: totalExpected > 0 ? (totalMissed / totalExpected) * 100 : 0,
    per_gateway: perGateway.map(g => ({
      gateway_id: g.gateway_id,
      received: g.received,
      missed: g.missed,
      loss_percent: (g.received + g.missed) > 0 ? (g.missed / (g.received + g.missed)) * 100 : 0
    }))
  };
}

export async function getJoinRequests(
  gatewayId: string | null = null,
  hours: number = 24,
  limit: number = 100
): Promise<Array<{
  timestamp: string;
  gateway_id: string;
  join_eui: string;
  dev_eui: string;
  operator: string;
  rssi: number;
  snr: number;
}>> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId
    ? `AND gateway_id = {gatewayId:String}`
    : '';

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        gateway_id,
        join_eui,
        dev_eui,
        operator,
        rssi,
        snr
      FROM packets
      WHERE packet_type = 'join_request'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { gatewayId: gatewayId ?? '', hours, limit },
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function getTimeSeries(options: {
  from?: Date;
  to?: Date;
  interval?: string;
  metric?: 'packets' | 'airtime';
  groupBy?: 'gateway' | 'operator';
  gatewayId?: string;
  deviceFilter?: DeviceFilter;
}): Promise<TimeSeriesPoint[]> {
  const client = getClickHouse();

  const {
    from = new Date(Date.now() - 24 * 60 * 60 * 1000),
    to = new Date(),
    interval = '1h',
    metric = 'packets',
    groupBy,
    gatewayId,
    deviceFilter,
  } = options;

  // Map interval string to ClickHouse function
  const intervalMap: Record<string, string> = {
    '5m': 'toStartOfFiveMinutes',
    '15m': 'toStartOfFifteenMinutes',
    '1h': 'toStartOfHour',
    '1d': 'toStartOfDay',
  };
  const intervalFunc = intervalMap[interval] ?? 'toStartOfHour';

  const metricExpr = metric === 'airtime'
    ? 'sum(airtime_us) / 1000000'  // Convert to seconds
    : 'count()';

  const groupByExpr = groupBy === 'gateway'
    ? 'gateway_id'
    : groupBy === 'operator'
      ? 'operator'
      : null;

  const gatewayFilter = gatewayId
    ? `AND gateway_id = {gatewayId:String}`
    : '';

  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);

  const fromStr = from.toISOString().replace('T', ' ').replace('Z', '');
  const toStr = to.toISOString().replace('T', ' ').replace('Z', '');

  const query = groupByExpr
    ? `
      SELECT
        ${intervalFunc}(timestamp) as ts,
        ${groupByExpr} as group_name,
        ${metricExpr} as value
      FROM packets
      WHERE timestamp >= parseDateTimeBestEffort({from:String})
        AND timestamp <= parseDateTimeBestEffort({to:String})
        ${gatewayFilter}
        ${deviceFilterSql}
      GROUP BY ts, group_name
      ORDER BY ts, group_name
    `
    : `
      SELECT
        ${intervalFunc}(timestamp) as ts,
        ${metricExpr} as value
      FROM packets
      WHERE timestamp >= parseDateTimeBestEffort({from:String})
        AND timestamp <= parseDateTimeBestEffort({to:String})
        ${gatewayFilter}
        ${deviceFilterSql}
      GROUP BY ts
      ORDER BY ts
    `;

  const result = await client.query({
    query,
    query_params: { from: fromStr, to: toStr, gatewayId: gatewayId ?? '' },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ ts: string; value: number; group_name?: string }>();

  return rows.map(row => ({
    timestamp: new Date(row.ts),
    value: row.value,
    group: row.group_name,
  }));
}

// Custom operators
export async function getCustomOperators(): Promise<Array<{
  id: number;
  prefix: string;
  name: string;
  priority: number;
}>> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT id, prefix, name, priority FROM custom_operators ORDER BY priority DESC, id`,
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function addCustomOperator(prefix: string, name: string, priority: number = 0): Promise<number> {
  const client = getClickHouse();

  // Get next ID
  const maxResult = await client.query({
    query: `SELECT max(id) as max_id FROM custom_operators`,
    format: 'JSONEachRow',
  });
  const maxRows = await maxResult.json<{ max_id: number }>();
  const nextId = (maxRows[0]?.max_id ?? 0) + 1;

  await client.insert({
    table: 'custom_operators',
    values: [{ id: nextId, prefix, name, priority }],
    format: 'JSONEachRow',
  });

  return nextId;
}

export async function deleteCustomOperator(id: number): Promise<void> {
  const client = getClickHouse();

  await client.command({
    query: `ALTER TABLE custom_operators DELETE WHERE id = {id:UInt32}`,
    query_params: { id },
  });
}

// Hide rules
export async function getHideRules(): Promise<Array<{
  id: number;
  rule_type: string;
  prefix: string;
  description: string | null;
}>> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT id, rule_type, prefix, description FROM hide_rules ORDER BY id`,
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function addHideRule(
  ruleType: 'dev_addr' | 'join_eui',
  prefix: string,
  description?: string
): Promise<number> {
  const client = getClickHouse();

  // Get next ID
  const maxResult = await client.query({
    query: `SELECT max(id) as max_id FROM hide_rules`,
    format: 'JSONEachRow',
  });
  const maxRows = await maxResult.json<{ max_id: number }>();
  const nextId = (maxRows[0]?.max_id ?? 0) + 1;

  await client.insert({
    table: 'hide_rules',
    values: [{ id: nextId, rule_type: ruleType, prefix, description: description ?? null }],
    format: 'JSONEachRow',
  });

  return nextId;
}

export async function deleteHideRule(id: number): Promise<void> {
  const client = getClickHouse();

  await client.command({
    query: `ALTER TABLE hide_rules DELETE WHERE id = {id:UInt32}`,
    query_params: { id },
  });
}

// ============================================
// Tree Navigation Queries
// ============================================

export async function getGatewayOperatorsWithDeviceCounts(
  gatewayId: string,
  hours: number = 24
): Promise<TreeOperator[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        operator,
        uniqExact(dev_addr) as device_count,
        count() as packet_count,
        sum(airtime_us) / 1000 as airtime_ms
      FROM packets
      WHERE gateway_id = {gatewayId:String}
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        AND packet_type = 'data'
      GROUP BY operator
      ORDER BY packet_count DESC
    `,
    query_params: { gatewayId, hours },
    format: 'JSONEachRow',
  });

  return result.json<TreeOperator>();
}

export async function getDevicesForGatewayOperator(
  gatewayId: string,
  operator: string,
  hours: number = 24,
  limit: number = 50
): Promise<TreeDevice[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        dev_addr,
        count() as packet_count,
        max(timestamp) as last_seen,
        avg(rssi) as avg_rssi,
        avg(snr) as avg_snr
      FROM packets
      WHERE gateway_id = {gatewayId:String}
        AND operator = {operator:String}
        AND packet_type = 'data'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
      GROUP BY dev_addr
      ORDER BY packet_count DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { gatewayId, operator, hours, limit },
    format: 'JSONEachRow',
  });

  return result.json<TreeDevice>();
}

// ============================================
// Device Profile Queries
// ============================================

export async function getDeviceProfile(
  devAddr: string,
  hours: number = 24,
  gatewayId: string | null = null
): Promise<DeviceProfile | null> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';

  const result = await client.query({
    query: `
      SELECT
        dev_addr,
        any(operator) as operator,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as packet_count,
        sum(airtime_us) / 1000 as total_airtime_ms,
        avg(rssi) as avg_rssi,
        avg(snr) as avg_snr
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND packet_type = 'data'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      GROUP BY dev_addr
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  const rows = await result.json<DeviceProfile>();
  return rows.length > 0 ? rows[0] : null;
}

export async function getDeviceFCntTimeline(
  devAddr: string,
  hours: number = 24
): Promise<FCntTimelinePoint[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        f_cnt,
        if(
          f_cnt IS NOT NULL AND lagInFrame(f_cnt) OVER (PARTITION BY coalesce(session_id, '') ORDER BY timestamp) IS NOT NULL
            AND f_cnt - lagInFrame(f_cnt) OVER (PARTITION BY coalesce(session_id, '') ORDER BY timestamp) > 1,
          1, 0
        ) as gap
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND packet_type = 'data'
        AND f_cnt IS NOT NULL
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
      ORDER BY timestamp
    `,
    query_params: { devAddr, hours },
    format: 'JSONEachRow',
  });

  return result.json<FCntTimelinePoint>();
}

export async function getDevicePacketIntervals(
  devAddr: string,
  hours: number = 24
): Promise<IntervalHistogram[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      WITH intervals AS (
        SELECT
          dateDiff('second', lagInFrame(timestamp) OVER (PARTITION BY coalesce(session_id, '') ORDER BY timestamp), timestamp) as interval_sec
        FROM packets
        WHERE dev_addr = {devAddr:String}
          AND packet_type = 'data'
          AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
      )
      SELECT
        floor(interval_sec / 60) * 60 as interval_seconds,
        count() as count
      FROM intervals
      WHERE interval_sec > 0 AND interval_sec < 86400
      GROUP BY interval_seconds
      ORDER BY interval_seconds
    `,
    query_params: { devAddr, hours },
    format: 'JSONEachRow',
  });

  return result.json<IntervalHistogram>();
}

export async function getDeviceSignalTrends(
  devAddr: string,
  hours: number = 24,
  _interval: string = '1h',
  gatewayId: string | null = null
): Promise<SignalTrendPoint[]> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        rssi as avg_rssi,
        snr as avg_snr,
        1 as packet_count
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND packet_type = 'data'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      ORDER BY timestamp
      LIMIT 500
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  return result.json<SignalTrendPoint>();
}

export async function getDeviceDistributions(
  devAddr: string,
  hours: number = 24,
  gatewayId: string | null = null
): Promise<{ sf: DistributionItem[]; frequency: DistributionItem[] }> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';

  const sfResult = await client.query({
    query: `
      SELECT
        toString(spreading_factor) as key,
        spreading_factor as value,
        count() as count
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND packet_type = 'data'
        AND spreading_factor IS NOT NULL
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      GROUP BY spreading_factor
      ORDER BY spreading_factor
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  const freqResult = await client.query({
    query: `
      SELECT
        toString(frequency) as key,
        frequency as value,
        count() as count
      FROM packets
      WHERE dev_addr = {devAddr:String}
        AND packet_type = 'data'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      GROUP BY frequency
      ORDER BY frequency
    `,
    query_params: { devAddr, hours, gatewayId },
    format: 'JSONEachRow',
  });

  return {
    sf: await sfResult.json<DistributionItem>(),
    frequency: await freqResult.json<DistributionItem>(),
  };
}

// ============================================
// Spectrum Analysis Queries
// ============================================

export async function getDutyCycleStats(
  gatewayId: string | null,
  hours: number = 1,
  deviceFilter?: DeviceFilter
): Promise<SpectrumStats> {
  const client = getClickHouse();

  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);

  // When showing all gateways, average the per-gateway percentages instead of summing
  const query = gatewayId
    ? `
      SELECT
        sumIf(airtime_us, packet_type NOT IN ('downlink', 'tx_ack')) as rx_airtime_us,
        sumIf(airtime_us, packet_type NOT IN ('downlink', 'tx_ack')) / (${hours} * 3600 * 1000000) * 100 as rx_airtime_percent,
        sumIf(airtime_us, packet_type = 'downlink') as tx_airtime_us,
        sumIf(airtime_us, packet_type = 'downlink') / (${hours} * 3600 * 1000000) * 100 as tx_duty_cycle_percent
      FROM packets
      WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
        AND gateway_id = {gatewayId:String}
        ${deviceFilterSql}
    `
    : `
      SELECT
        sum(gw_rx_airtime_us) as rx_airtime_us,
        avg(gw_rx_pct) as rx_airtime_percent,
        sum(gw_tx_airtime_us) as tx_airtime_us,
        avg(gw_tx_pct) as tx_duty_cycle_percent
      FROM (
        SELECT
          gateway_id,
          sumIf(airtime_us, packet_type NOT IN ('downlink', 'tx_ack')) as gw_rx_airtime_us,
          sumIf(airtime_us, packet_type NOT IN ('downlink', 'tx_ack')) / (${hours} * 3600 * 1000000) * 100 as gw_rx_pct,
          sumIf(airtime_us, packet_type = 'downlink') as gw_tx_airtime_us,
          sumIf(airtime_us, packet_type = 'downlink') / (${hours} * 3600 * 1000000) * 100 as gw_tx_pct
        FROM packets
        WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
          ${deviceFilterSql}
        GROUP BY gateway_id
      )
    `;

  const result = await client.query({
    query,
    query_params: { gatewayId, hours },
    format: 'JSONEachRow',
  });

  const rows = await result.json<SpectrumStats>();
  return rows[0] ?? { rx_airtime_us: 0, rx_airtime_percent: 0, tx_airtime_us: 0, tx_duty_cycle_percent: 0 };
}

export interface DownlinkStats {
  downlinks: number;
  tx_ack_ok: number;
  tx_ack_failed: number;
  tx_ack_duty_cycle: number;
}

export async function getDownlinkStats(
  gatewayId: string | null,
  hours: number = 24
): Promise<DownlinkStats> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? `AND gateway_id = {gatewayId:String}` : '';

  const result = await client.query({
    query: `
      SELECT
        countIf(packet_type = 'downlink') as downlinks,
        countIf(packet_type = 'tx_ack' AND f_port = 1) as tx_ack_ok,
        countIf(packet_type = 'tx_ack' AND f_port NOT IN (0, 1)) as tx_ack_failed,
        countIf(packet_type = 'tx_ack' AND f_port = 11) as tx_ack_duty_cycle
      FROM packets
      WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
    `,
    query_params: { gatewayId, hours },
    format: 'JSONEachRow',
  });

  const rows = await result.json<DownlinkStats>();
  return rows[0] ?? { downlinks: 0, tx_ack_ok: 0, tx_ack_failed: 0, tx_ack_duty_cycle: 0 };
}

export async function getChannelDistribution(
  gatewayId: string | null,
  hours: number = 24,
  deviceFilter?: DeviceFilter
): Promise<ChannelStats[]> {
  const client = getClickHouse();

  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);
  const gatewayFilter = gatewayId
    ? `AND gateway_id = {gatewayId:String}`
    : '';

  const result = await client.query({
    query: `
      SELECT
        frequency,
        packet_count,
        channel_airtime as airtime_us,
        if(total_airtime > 0, channel_airtime / total_airtime * 100, 0) as usage_percent
      FROM (
        SELECT
          frequency,
          count() as packet_count,
          sum(airtime_us) as channel_airtime,
          sum(sum(airtime_us)) OVER () as total_airtime
        FROM packets
        WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
          ${gatewayFilter}
          ${deviceFilterSql}
        GROUP BY frequency
      )
      ORDER BY frequency
    `,
    query_params: { gatewayId: gatewayId ?? '', hours },
    format: 'JSONEachRow',
  });

  return result.json<ChannelStats>();
}

export async function getSFDistribution(
  gatewayId: string | null,
  hours: number = 24,
  deviceFilter?: DeviceFilter
): Promise<SFStats[]> {
  const client = getClickHouse();

  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);
  const gatewayFilter = gatewayId
    ? `AND gateway_id = {gatewayId:String}`
    : '';

  const result = await client.query({
    query: `
      SELECT
        spreading_factor,
        packet_count,
        sf_airtime as airtime_us,
        if(total_airtime > 0, sf_airtime / total_airtime * 100, 0) as usage_percent
      FROM (
        SELECT
          spreading_factor,
          count() as packet_count,
          sum(airtime_us) as sf_airtime,
          sum(sum(airtime_us)) OVER () as total_airtime
        FROM packets
        WHERE spreading_factor IS NOT NULL
          AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
          ${gatewayFilter}
          ${deviceFilterSql}
        GROUP BY spreading_factor
      )
      ORDER BY spreading_factor
    `,
    query_params: { gatewayId: gatewayId ?? '', hours },
    format: 'JSONEachRow',
  });

  return result.json<SFStats>();
}

// ============================================
// Join Activity Queries
// ============================================

export async function getJoinRequestsByJoinEui(
  gatewayId: string | null = null,
  hours: number = 24
): Promise<JoinEuiGroup[]> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId
    ? `AND gateway_id = {gatewayId:String}`
    : '';

  const result = await client.query({
    query: `
      SELECT
        join_eui,
        any(operator) as operator,
        count() as total_attempts,
        uniqExact(dev_eui) as unique_dev_euis,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen
      FROM packets
      WHERE packet_type = 'join_request'
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
      GROUP BY join_eui
      ORDER BY total_attempts DESC
    `,
    query_params: { gatewayId: gatewayId ?? '', hours },
    format: 'JSONEachRow',
  });

  return result.json<JoinEuiGroup>();
}

export async function getJoinEuiTimeline(
  joinEui: string,
  hours: number = 24
): Promise<Array<{
  timestamp: string;
  gateway_id: string;
  dev_eui: string;
  rssi: number;
  snr: number;
}>> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        gateway_id,
        dev_eui,
        rssi,
        snr
      FROM packets
      WHERE packet_type = 'join_request'
        AND join_eui = {joinEui:String}
        AND timestamp > now() - INTERVAL {hours:UInt32} HOUR
      ORDER BY timestamp DESC
      LIMIT 500
    `,
    query_params: { joinEui, hours },
    format: 'JSONEachRow',
  });

  return result.json();
}

export async function getSummaryStats(
  hours: number = 24,
  gatewayId?: string,
  deviceFilter?: DeviceFilter
): Promise<{ total_packets: number; unique_devices: number; total_airtime_ms: number }> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';
  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);

  const result = await client.query({
    query: `
      SELECT
        count() as total_packets,
        uniqExact(dev_addr) as unique_devices,
        sum(airtime_us) / 1000 as total_airtime_ms
      FROM packets
      WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
        ${deviceFilterSql}
    `,
    query_params: { hours, gatewayId },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ total_packets: number; unique_devices: number; total_airtime_ms: number }>();
  return rows[0] || { total_packets: 0, unique_devices: 0, total_airtime_ms: 0 };
}

export async function getOperatorStats(
  hours: number = 24,
  gatewayId?: string,
  deviceFilter?: DeviceFilter
): Promise<OperatorStats[]> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';
  const deviceFilterSql = buildDeviceFilterSql(deviceFilter);

  const result = await client.query({
    query: `
      SELECT
        operator,
        count() as packet_count,
        uniqExact(dev_addr) as unique_devices,
        sum(airtime_us) / 1000 as total_airtime_ms
      FROM packets
      WHERE timestamp > now() - INTERVAL {hours:UInt32} HOUR
        ${gatewayFilter}
        ${deviceFilterSql}
      GROUP BY operator
      ORDER BY packet_count DESC
    `,
    query_params: { hours, gatewayId },
    format: 'JSONEachRow',
  });

  return result.json<OperatorStats>();
}

export async function getRecentPackets(
  limit: number = 100,
  gatewayId?: string,
  deviceFilter?: { include?: Array<{prefix: number, mask: number}>, exclude?: Array<{prefix: number, mask: number}> },
  packetTypes?: string[],
  devAddr?: string,
  hours?: number,
  rssiMin?: number,
  rssiMax?: number
): Promise<Array<{
  timestamp: string;
  gateway_id: string;
  packet_type: string;
  dev_addr: string | null;
  join_eui: string | null;
  dev_eui: string | null;
  operator: string;
  frequency: number;
  spreading_factor: number | null;
  bandwidth: number;
  rssi: number;
  snr: number;
  payload_size: number;
  f_cnt: number | null;
  f_port: number | null;
  confirmed: boolean | null;
  airtime_us: number;
}>> {
  const client = getClickHouse();

  const gatewayFilter = gatewayId ? 'AND gateway_id = {gatewayId:String}' : '';
  // When filtering by dev_addr, include related tx_ack packets (which have dev_addr=null)
  // by matching on f_cnt (downlink_id) from downlinks belonging to this device
  const devAddrFilter = devAddr
    ? `AND (dev_addr = {devAddr:String} OR (packet_type = 'tx_ack' AND f_cnt IN (
        SELECT f_cnt FROM packets WHERE dev_addr = {devAddr:String} AND packet_type = 'downlink'
        ${hours ? `AND timestamp > now() - INTERVAL {hours:UInt32} HOUR` : ''}
      )))`
    : '';
  const hoursFilter = hours ? `AND timestamp > now() - INTERVAL {hours:UInt32} HOUR` : '';
  const rssiFilter = (rssiMin !== undefined || rssiMax !== undefined)
    ? `AND (packet_type IN ('tx_ack', 'downlink') OR (${rssiMin !== undefined ? 'rssi >= {rssiMin:Int32}' : '1=1'} AND ${rssiMax !== undefined ? 'rssi <= {rssiMax:Int32}' : '1=1'}))`
    : '';

  // Build device address filter based on include/exclude prefixes
  // dev_addr is stored as hex string (e.g., "2601ABCD"), convert to UInt32 for bitwise ops
  let deviceAddrFilter = '';
  if (deviceFilter) {
    const conditions: string[] = [];

    if (deviceFilter.include && deviceFilter.include.length > 0) {
      // Include only packets matching these prefixes (OR logic)
      // Only apply to data/downlink packets - join_request and tx_ack always pass through
      const includeConditions = deviceFilter.include.map((r) =>
        `(bitAnd(reinterpretAsUInt32(reverse(unhex(dev_addr))), ${r.mask >>> 0}) = ${r.prefix >>> 0})`
      );
      conditions.push(`(packet_type NOT IN ('data', 'downlink') OR dev_addr IS NULL OR dev_addr = '' OR (${includeConditions.join(' OR ')}))`);
    }

    if (deviceFilter.exclude && deviceFilter.exclude.length > 0) {
      // Exclude packets matching these prefixes (AND NOT logic)
      // Only apply to data/downlink packets - join_request and tx_ack always pass through
      const excludeConditions = deviceFilter.exclude.map((r) =>
        `(bitAnd(reinterpretAsUInt32(reverse(unhex(dev_addr))), ${r.mask >>> 0}) != ${r.prefix >>> 0})`
      );
      conditions.push(`(packet_type NOT IN ('data', 'downlink') OR dev_addr IS NULL OR dev_addr = '' OR (${excludeConditions.join(' AND ')}))`);
    }

    if (conditions.length > 0) {
      deviceAddrFilter = 'AND ' + conditions.join(' AND ');
    }
  }

  // Build packet type filter
  let packetTypeFilter = '';
  if (packetTypes && packetTypes.length > 0 && packetTypes.length < 4) {
    const types = packetTypes.map(t => `'${t}'`).join(', ');
    packetTypeFilter = `AND packet_type IN (${types})`;
  }

  const result = await client.query({
    query: `
      SELECT
        timestamp,
        gateway_id,
        packet_type,
        dev_addr,
        join_eui,
        dev_eui,
        operator,
        frequency,
        spreading_factor,
        bandwidth,
        rssi,
        snr,
        payload_size,
        f_cnt,
        f_port,
        confirmed,
        airtime_us
      FROM packets
      WHERE 1=1
        ${gatewayFilter}
        ${devAddrFilter}
        ${hoursFilter}
        ${rssiFilter}
        ${deviceAddrFilter}
        ${packetTypeFilter}
      ORDER BY timestamp DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { limit, gatewayId, devAddr, hours, rssiMin, rssiMax },
    format: 'JSONEachRow',
  });

  return result.json();
}

// ============================================
// Device Metadata Queries
// ============================================

export async function upsertDeviceMetadata(metadata: DeviceMetadata): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  await client.insert({
    table: 'device_metadata',
    values: [{
      dev_addr: metadata.dev_addr,
      dev_eui: metadata.dev_eui,
      device_name: metadata.device_name,
      application_name: metadata.application_name,
      device_profile_name: metadata.device_profile_name,
      last_seen: now,
    }],
    format: 'JSONEachRow',
  });
}

// ============================================
// Settings Queries
// ============================================

export async function getSetting(key: string): Promise<string | null> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT value FROM settings FINAL WHERE key = {key:String}`,
    query_params: { key },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ value: string }>();
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  await client.insert({
    table: 'settings',
    values: [{ key, value, updated_at: now }],
    format: 'JSONEachRow',
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT key, value FROM settings FINAL`,
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function getAllDeviceMetadata(): Promise<DeviceMetadata[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `
      SELECT
        dev_addr,
        dev_eui,
        device_name,
        application_name,
        device_profile_name,
        last_seen
      FROM device_metadata FINAL
    `,
    format: 'JSONEachRow',
  });

  return result.json<DeviceMetadata>();
}

// ============================================
// Import Profile Queries
// ============================================

export async function getImportProfiles(): Promise<ImportProfile[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT id, name, required_tags, created_at, updated_at FROM import_profiles FINAL WHERE deleted = 0 ORDER BY name`,
    format: 'JSONEachRow',
  });

  return result.json<ImportProfile>();
}

export async function getImportProfileById(id: string): Promise<ImportProfile | null> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT id, name, required_tags, created_at, updated_at FROM import_profiles FINAL WHERE id = {id:String} AND deleted = 0`,
    query_params: { id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<ImportProfile>();
  return rows.length > 0 ? rows[0] : null;
}

export async function insertImportProfile(profile: { id: string; name: string; required_tags: string[] }): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  await client.insert({
    table: 'import_profiles',
    values: [{
      id: profile.id,
      name: profile.name,
      required_tags: profile.required_tags,
      created_at: now,
      updated_at: now,
      deleted: 0,
    }],
    format: 'JSONEachRow',
  });
}

export async function updateImportProfile(id: string, data: { name?: string; required_tags?: string[] }): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  // Fetch current profile to merge fields
  const existing = await getImportProfileById(id);
  if (!existing) throw new Error(`Import profile ${id} not found`);

  await client.insert({
    table: 'import_profiles',
    values: [{
      id,
      name: data.name ?? existing.name,
      required_tags: data.required_tags ?? existing.required_tags,
      created_at: existing.created_at,
      updated_at: now,
      deleted: 0,
    }],
    format: 'JSONEachRow',
  });
}

export async function deleteImportProfile(id: string): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  const existing = await getImportProfileById(id);
  if (!existing) throw new Error(`Import profile ${id} not found`);

  await client.insert({
    table: 'import_profiles',
    values: [{
      id,
      name: existing.name,
      required_tags: existing.required_tags,
      created_at: existing.created_at,
      updated_at: now,
      deleted: 1,
    }],
    format: 'JSONEachRow',
  });
}

// ============================================
// ChirpStack Server Queries
// ============================================

export async function getChirpStackServers(): Promise<ChirpStackServer[]> {
  const client = getClickHouse();

  const result = await client.query({
    query: `SELECT id, name, url, created_at FROM chirpstack_servers FINAL WHERE deleted = 0 ORDER BY name`,
    format: 'JSONEachRow',
  });

  return result.json<ChirpStackServer>();
}

export async function insertChirpStackServer(server: { id: string; name: string; url: string }): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  await client.insert({
    table: 'chirpstack_servers',
    values: [{
      id: server.id,
      name: server.name,
      url: server.url,
      created_at: now,
      updated_at: now,
      deleted: 0,
    }],
    format: 'JSONEachRow',
  });
}

export async function deleteChirpStackServer(id: string): Promise<void> {
  const client = getClickHouse();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  // Fetch current to get existing data for ReplacingMergeTree
  const result = await client.query({
    query: `SELECT id, name, url, created_at FROM chirpstack_servers FINAL WHERE id = {id:String} AND deleted = 0`,
    query_params: { id },
    format: 'JSONEachRow',
  });

  const rows = await result.json<ChirpStackServer>();
  if (rows.length === 0) throw new Error(`ChirpStack server ${id} not found`);

  const existing = rows[0];

  await client.insert({
    table: 'chirpstack_servers',
    values: [{
      id,
      name: existing.name,
      url: existing.url,
      created_at: existing.created_at,
      updated_at: now,
      deleted: 1,
    }],
    format: 'JSONEachRow',
  });
}
