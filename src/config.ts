import { readFileSync, existsSync } from 'fs';
import toml from 'toml';
import type { Config } from './types.js';

const DEFAULT_CONFIG: Config = {
  mqtt: {
    server: 'tcp://localhost:1883',
    username: '',
    password: '',
    topic: 'eu868/gateway/+/event/up',
    format: 'protobuf',
  },
  clickhouse: {
    url: 'http://localhost:8123',
    database: 'lorawan',
  },
  api: {
    bind: '127.0.0.1:3000',
  },
  operators: [],
  hide_rules: [],
};

export function loadConfig(configPath: string): Config {
  if (!existsSync(configPath)) {
    console.warn(`Config file not found at ${configPath}, using defaults`);
    return DEFAULT_CONFIG;
  }

  const content = readFileSync(configPath, 'utf-8');
  const parsed = toml.parse(content) as Partial<Config>;

  return {
    mqtt: { ...DEFAULT_CONFIG.mqtt, ...parsed.mqtt },
    clickhouse: { ...DEFAULT_CONFIG.clickhouse, ...parsed.clickhouse },
    api: { ...DEFAULT_CONFIG.api, ...parsed.api },
    operators: parsed.operators ?? [],
    hide_rules: parsed.hide_rules ?? [],
    chirpstack_api: (parsed as any).chirpstack_api ?? undefined,
  };
}
