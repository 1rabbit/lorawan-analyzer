import type { DeviceMetadata } from '../types.js';
import { getAllDeviceMetadata, upsertDeviceMetadata } from '../db/queries.js';

export class DeviceMetadataCache {
  private byDevAddr = new Map<string, DeviceMetadata>();
  private byDevEui = new Map<string, DeviceMetadata>();

  async loadFromDatabase(): Promise<void> {
    const rows = await getAllDeviceMetadata();
    for (const row of rows) {
      const metadata: DeviceMetadata = {
        ...row,
        last_seen: new Date(row.last_seen),
      };
      this.byDevAddr.set(metadata.dev_addr, metadata);
      if (metadata.dev_eui) {
        this.byDevEui.set(metadata.dev_eui, metadata);
      }
    }
  }

  async upsert(metadata: DeviceMetadata): Promise<void> {
    // Preserve existing last_payload if new metadata doesn't have one
    const existing = this.byDevAddr.get(metadata.dev_addr);
    if (!metadata.last_payload && existing?.last_payload) {
      metadata.last_payload = existing.last_payload;
    }

    this.byDevAddr.set(metadata.dev_addr, metadata);
    if (metadata.dev_eui) {
      this.byDevEui.set(metadata.dev_eui, metadata);
    }
    await upsertDeviceMetadata(metadata);
  }

  getByDevAddr(devAddr: string): DeviceMetadata | null {
    return this.byDevAddr.get(devAddr) ?? null;
  }

  getByDevEui(devEui: string): DeviceMetadata | null {
    return this.byDevEui.get(devEui) ?? null;
  }

  getAll(): DeviceMetadata[] {
    return Array.from(this.byDevAddr.values());
  }

  get size(): number {
    return this.byDevAddr.size;
  }
}
