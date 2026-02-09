import { createClient, ClickHouseClient } from '@clickhouse/client';
import type { ClickHouseConfig } from '../types.js';

let client: ClickHouseClient | null = null;

export function initClickHouse(config: ClickHouseConfig): ClickHouseClient {
  client = createClient({
    url: config.url,
    database: config.database,
    username: 'default',
    password: '',
  });
  return client;
}

export function getClickHouse(): ClickHouseClient {
  if (!client) {
    throw new Error('ClickHouse client not initialized');
  }
  return client;
}

export async function closeClickHouse(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
