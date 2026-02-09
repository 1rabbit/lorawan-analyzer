import { readFileSync, existsSync } from 'fs';
import toml from 'toml';
import type { Config, MqttConfig, ChirpStackApiConfig } from './types.js';
import { getAllSettings } from './db/queries.js';

export const DEFAULT_CONFIG: Config = {
  mqtt: {
    server: '',
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

function applyEnvOverrides(config: Config): Config {
  if (process.env.CLICKHOUSE_URL) {
    config.clickhouse.url = process.env.CLICKHOUSE_URL;
  }
  if (process.env.CLICKHOUSE_DATABASE) {
    config.clickhouse.database = process.env.CLICKHOUSE_DATABASE;
  }
  if (process.env.API_BIND) {
    config.api.bind = process.env.API_BIND;
  }
  return config;
}

export function loadConfig(configPath: string): Config {
  if (!existsSync(configPath)) {
    console.warn(`Config file not found at ${configPath}, using defaults`);
    return applyEnvOverrides({ ...DEFAULT_CONFIG });
  }

  const content = readFileSync(configPath, 'utf-8');
  const parsed = toml.parse(content) as Partial<Config>;

  const config: Config = {
    mqtt: { ...DEFAULT_CONFIG.mqtt, ...parsed.mqtt },
    clickhouse: { ...DEFAULT_CONFIG.clickhouse, ...parsed.clickhouse },
    api: { ...DEFAULT_CONFIG.api, ...parsed.api },
    operators: parsed.operators ?? [],
    hide_rules: parsed.hide_rules ?? [],
    chirpstack_api: (parsed as any).chirpstack_api ?? undefined,
  };

  return applyEnvOverrides(config);
}

export async function loadSettingsFromDb(): Promise<{ mqtt?: MqttConfig; chirpstack_api?: ChirpStackApiConfig }> {
  const settings = await getAllSettings();
  const result: { mqtt?: MqttConfig; chirpstack_api?: ChirpStackApiConfig } = {};

  if (settings.mqtt) {
    try {
      result.mqtt = JSON.parse(settings.mqtt);
    } catch {
      console.warn('Failed to parse mqtt settings from DB');
    }
  }

  if (settings.chirpstack_api) {
    try {
      result.chirpstack_api = JSON.parse(settings.chirpstack_api);
    } catch {
      console.warn('Failed to parse chirpstack_api settings from DB');
    }
  }

  return result;
}

export function mergeConfigWithDbSettings(
  config: Config,
  dbSettings: { mqtt?: MqttConfig; chirpstack_api?: ChirpStackApiConfig },
): Config {
  return {
    ...config,
    mqtt: dbSettings.mqtt ? { ...config.mqtt, ...dbSettings.mqtt } : config.mqtt,
    chirpstack_api: dbSettings.chirpstack_api ?? config.chirpstack_api,
  };
}
