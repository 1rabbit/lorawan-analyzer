export interface ChirpStackApiConfig {
  url: string;
  api_key: string;
}

export interface Config {
  mqtt: MqttConfig;
  clickhouse: ClickHouseConfig;
  api: ApiConfig;
  operators: OperatorMapping[];
  hide_rules: HideRule[];
  chirpstack_api?: ChirpStackApiConfig;
}

export interface MqttConfig {
  server: string;
  username: string;
  password: string;
  topic: string;
  format: 'protobuf' | 'json';
  downlink_sources?: MqttDownlinkSource[];
  application_topic?: string;
}

export interface MqttDownlinkSource {
  server: string;
  username?: string;
  password?: string;
  topic: string;
  format: 'protobuf' | 'json';
}

export interface ClickHouseConfig {
  url: string;
  database: string;
}

export interface ApiConfig {
  bind: string;
}

export interface OperatorMapping {
  prefix: string | string[];
  name: string;
  priority?: number;
  known_devices?: boolean;
  color?: string;
}

export interface HideRule {
  type: 'dev_addr' | 'join_eui';
  prefix: string;
  description?: string;
}

export interface ParsedPacket {
  timestamp: Date;
  gateway_id: string;
  packet_type: 'data' | 'join_request' | 'downlink' | 'tx_ack';
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
  airtime_us: number;
  f_cnt: number | null;
  f_port: number | null;
  confirmed: boolean | null;  // true for confirmed uplink/downlink, false for unconfirmed, null for other types
  session_id?: string | null;
}

export interface LivePacket {
  timestamp: number;
  gateway_id: string;
  type: 'data' | 'join_request' | 'downlink' | 'tx_ack';
  dev_addr?: string;
  f_cnt?: number;
  f_port?: number;
  join_eui?: string;
  dev_eui?: string;
  operator: string;
  data_rate: string;
  frequency: number;
  snr: number;
  rssi: number;
  payload_size: number;
  airtime_ms: number;
  tx_status?: string;  // For tx_ack packets
  confirmed?: boolean;  // For data/downlink packets
  device_name?: string;  // From device metadata cache
}

export interface GatewayStats {
  gateway_id: string;
  name: string | null;
  first_seen: Date;
  last_seen: Date;
  packet_count: number;
  unique_devices: number;
  total_airtime_ms: number;
}

export interface OperatorStats {
  operator: string;
  packet_count: number;
  unique_devices: number;
  total_airtime_ms: number;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  group?: string;
}

export interface MyDeviceRange {
  type: 'dev_addr' | 'join_eui';
  prefix: string;
  description?: string;
}


export interface DeviceProfile {
  dev_addr: string;
  operator: string;
  first_seen: string;
  last_seen: string;
  packet_count: number;
  total_airtime_ms: number;
  avg_rssi: number;
  avg_snr: number;
  device_name?: string;
  dev_eui?: string;
  application_name?: string;
  device_profile_name?: string;
}

export interface JoinEuiGroup {
  join_eui: string;
  operator: string;
  total_attempts: number;
  unique_dev_euis: number;
  first_seen: string;
  last_seen: string;
}

export interface SpectrumStats {
  rx_airtime_us: number;
  rx_airtime_percent: number;
  tx_airtime_us: number;
  tx_duty_cycle_percent: number;
}

export interface ChannelStats {
  frequency: number;
  packet_count: number;
  airtime_us: number;
  usage_percent: number;
}

export interface SFStats {
  spreading_factor: number;
  packet_count: number;
  airtime_us: number;
  usage_percent: number;
}

export interface TreeOperator {
  operator: string;
  device_count: number;
  packet_count: number;
  airtime_ms: number;
}

export interface TreeDevice {
  dev_addr: string;
  packet_count: number;
  last_seen: string;
  avg_rssi: number;
  avg_snr: number;
  device_name?: string;
}

export interface LastPayload {
  f_cnt: number;
  f_port: number;
  raw_base64: string;
  decoded: Record<string, unknown> | null;
  timestamp: Date;
}

export interface DeviceMetadata {
  dev_addr: string;
  dev_eui: string;
  device_name: string;
  application_name: string;
  device_profile_name: string;
  last_seen: Date;
  last_payload?: LastPayload;
}

export interface FCntTimelinePoint {
  timestamp: string;
  f_cnt: number;
  gap: boolean;
}

export interface IntervalHistogram {
  interval_seconds: number;
  count: number;
}

export interface SignalTrendPoint {
  timestamp: string;
  avg_rssi: number;
  avg_snr: number;
  packet_count: number;
}

export interface DistributionItem {
  key: string;
  value: number;
  count: number;
}

// ============================================
// Import / Device Management Types
// ============================================

export interface ImportProfile {
  id: string;
  name: string;
  required_tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ChirpStackServer {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface ImportResult {
  created: string[];
  skipped: string[];
  errors: Array<{ dev_eui: string; message: string }>;
  total: number;
}

export interface CsvParseResult {
  columns: string[];
  separator: string;
  auto_mapping: Record<string, string>;
  preview: Record<string, string>[];
  total_rows: number;
}

export interface ValidationResult {
  valid: number;
  errors: Array<{ row: number; field: string; message: string }>;
  duplicates: Array<{ dev_eui: string; existing_name: string; csv_name: string }>;
  warnings: string[];
}

export interface ChirpStackError {
  status: number;
  code: string;
  message: string;
  detail?: string;
}
