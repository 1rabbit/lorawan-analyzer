import type { ImportResult, ImportProfile } from '../types.js';
import type { ChirpStackClient } from '../chirpstack/client.js';
import { ChirpStackApiError } from '../chirpstack/client.js';
import { validateDevEui, validateAppKey, validateRow } from './validator.js';
import * as XLSX from 'xlsx';

// ============================================
// executeImport — Main import orchestration
// ============================================

export async function executeImport(params: {
  data: Record<string, string>[];
  mapping: Record<string, string>;
  profileId?: string;
  profile?: ImportProfile;
  additionalTags: Record<string, string>;
  client: ChirpStackClient;
  applicationId: string;
  deviceProfileId: string;
  duplicateAction: 'skip' | 'overwrite';
  onProgress?: (current: number, total: number) => void;
}): Promise<ImportResult> {
  const {
    data,
    mapping,
    profile,
    additionalTags,
    client,
    applicationId,
    deviceProfileId,
    duplicateAction,
    onProgress,
  } = params;

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ dev_eui: string; message: string }> = [];
  const total = data.length;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    // 1. Extract fields from row using mapping
    const devEui = (row[mapping['dev_eui']] ?? '').trim().toUpperCase();
    const name = (row[mapping['name']] ?? '').trim();
    const description = (row[mapping['description']] ?? '').trim();
    const appKey = (row[mapping['app_key']] ?? '').trim();

    // 1b. Pre-validate: skip rows that fail validation
    const rowValidation = validateRow(row, mapping, profile, deviceProfileId);
    if (!rowValidation.valid) {
      const msgs = rowValidation.errors.map(e => e.field + ': ' + e.message).join('; ');
      errors.push({ dev_eui: devEui || `(row ${i + 1})`, message: msgs });
      onProgress?.(i + 1, total);
      continue;
    }

    // Extract tags from mapping (keys that aren't standard fields)
    const standardFields = new Set(['dev_eui', 'name', 'description', 'app_key', 'device_profile_id']);
    const rowTags: Record<string, string> = {};
    for (const [logicalName, csvColumn] of Object.entries(mapping)) {
      if (!standardFields.has(logicalName)) {
        const value = (row[csvColumn] ?? '').trim();
        if (value !== '') {
          rowTags[logicalName] = value;
        }
      }
    }

    // 2. Build device data
    const deviceData = {
      applicationId,
      deviceProfileId,
      name,
      devEui,
      description,
      tags: { ...additionalTags, ...rowTags },
    };

    try {
      // 3. Check if device exists
      let exists = false;
      try {
        await client.getDevice(devEui);
        exists = true;
      } catch (err: unknown) {
        if (err instanceof ChirpStackApiError && err.code === 'NOT_FOUND') {
          exists = false;
        } else {
          throw err;
        }
      }

      if (exists) {
        if (duplicateAction === 'skip') {
          // 4. Skip duplicates
          skipped.push(devEui);
        } else {
          // 5. Overwrite: delete then create
          await client.deleteDevice(devEui);
          await client.createDevice(deviceData);
          if (appKey) {
            await client.createDeviceKeys(devEui, appKey);
          }
          created.push(devEui);
        }
      } else {
        // 6 & 7. Create new device
        await client.createDevice(deviceData);
        if (appKey) {
          await client.createDeviceKeys(devEui, appKey);
        }
        created.push(devEui);
      }
    } catch (err: unknown) {
      // 9. On any error, add to errors
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ dev_eui: devEui, message });
    }

    // 10. Progress callback
    onProgress?.(i + 1, total);
  }

  return { created, skipped, errors, total };
}

// ============================================
// undoImport — Undo a previous import
// ============================================

export async function undoImport(
  devEuis: string[],
  client: ChirpStackClient,
): Promise<{ deleted: number; errors: Array<{ devEui: string; message: string }> }> {
  let deleted = 0;
  const errors: Array<{ devEui: string; message: string }> = [];

  for (const devEui of devEuis) {
    try {
      await client.deleteDevice(devEui);
      deleted++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ devEui, message });
    }
  }

  return { deleted, errors };
}

// ============================================
// exportDevices — Export devices to CSV or XLSX
// ============================================

const EXPORT_KEYS_BATCH_SIZE = 10;

export async function exportDevices(params: {
  client: ChirpStackClient;
  applicationId: string;
  includeKeys: boolean;
  format: 'csv' | 'xlsx';
  filterDp?: string;
  filterActivity?: 'active' | 'inactive' | 'never_seen';
  filterTag?: string;
}): Promise<Buffer> {
  const { client, applicationId, includeKeys, format, filterDp, filterActivity, filterTag } = params;

  // 1. Load ALL devices via pagination
  const allDevices: Array<{
    devEui: string;
    name: string;
    description: string;
    deviceProfileId: string;
    deviceProfileName: string;
    isDisabled: boolean;
    lastSeenAt: string | null;
    tags: Record<string, string>;
  }> = [];

  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await client.listDevices(applicationId, limit, offset);
    allDevices.push(...page.result);
    offset += limit;
    if (offset >= Number(page.totalCount)) {
      break;
    }
  }

  // 2. Apply filters
  let filteredDevices = allDevices;

  if (filterDp) {
    filteredDevices = filteredDevices.filter((d) => d.deviceProfileId === filterDp);
  }

  if (filterActivity) {
    const now = Date.now();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    filteredDevices = filteredDevices.filter((d) => {
      if (filterActivity === 'never_seen') {
        return d.lastSeenAt === null || d.lastSeenAt === '';
      }
      if (d.lastSeenAt === null || d.lastSeenAt === '') {
        return false;
      }
      const lastSeenMs = new Date(d.lastSeenAt).getTime();
      const isActive = (now - lastSeenMs) < twentyFourHoursMs;
      return filterActivity === 'active' ? isActive : !isActive;
    });
  }

  if (filterTag) {
    const eqIndex = filterTag.indexOf('=');
    if (eqIndex !== -1) {
      const tagKey = filterTag.substring(0, eqIndex);
      const tagValue = filterTag.substring(eqIndex + 1);
      filteredDevices = filteredDevices.filter((d) => d.tags[tagKey] === tagValue);
    }
  }

  // 3. If includeKeys, fetch device keys in batches of 10
  const keysMap = new Map<string, string>();
  if (includeKeys) {
    for (let i = 0; i < filteredDevices.length; i += EXPORT_KEYS_BATCH_SIZE) {
      const batch = filteredDevices.slice(i, i + EXPORT_KEYS_BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (d) => {
          const keysResponse = await client.getDeviceKeys(d.devEui);
          const keys = keysResponse.deviceKeys;
          // LoRaWAN 1.0.x: key is in nwkKey, appKey is zeros
          // LoRaWAN 1.1.x: key is in appKey
          const allZeros = /^0+$/.test(keys.appKey || '');
          const effectiveKey = (!keys.appKey || allZeros) ? keys.nwkKey : keys.appKey;
          return { devEui: d.devEui, appKey: effectiveKey || '' };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          keysMap.set(result.value.devEui, result.value.appKey);
        }
        // Ignore NOT_FOUND errors and other failures silently
      }
    }
  }

  // 4. Build columns dynamically
  // Discover all unique tag keys across all filtered devices
  const allTagKeys = new Set<string>();
  for (const device of filteredDevices) {
    for (const key of Object.keys(device.tags)) {
      allTagKeys.add(key);
    }
  }
  const sortedTagKeys = [...allTagKeys].sort();

  // Build header row
  const baseColumns = ['dev_eui', 'name', 'description', 'device_profile_id', 'device_profile_name'];
  const columns = [...baseColumns, ...sortedTagKeys];
  if (includeKeys) {
    columns.push('app_key');
  }

  // Build data rows
  const rows: Record<string, string>[] = filteredDevices.map((d) => {
    const row: Record<string, string> = {
      dev_eui: d.devEui,
      name: d.name,
      description: d.description,
      device_profile_id: d.deviceProfileId,
      device_profile_name: d.deviceProfileName,
    };

    for (const tagKey of sortedTagKeys) {
      row[tagKey] = d.tags[tagKey] ?? '';
    }

    if (includeKeys) {
      row['app_key'] = keysMap.get(d.devEui) ?? '';
    }

    return row;
  });

  // 5. Format as CSV or XLSX
  if (format === 'csv') {
    const separator = ';';
    const lines: string[] = [];
    lines.push(columns.join(separator));
    for (const row of rows) {
      const values = columns.map((col) => row[col] ?? '');
      lines.push(values.join(separator));
    }
    return Buffer.from(lines.join('\n'), 'utf-8');
  } else {
    // XLSX format
    const wsData = [columns, ...rows.map((row) => columns.map((col) => row[col] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return xlsxBuffer;
  }
}

// ============================================
// migrateDevices — Move devices between applications
// ============================================

export async function migrateDevices(
  devEuis: string[],
  client: ChirpStackClient,
  sourceAppId: string,
  destAppId: string,
): Promise<{ migrated: number; errors: Array<{ devEui: string; message: string }> }> {
  let migrated = 0;
  const errors: Array<{ devEui: string; message: string }> = [];

  for (const devEui of devEuis) {
    try {
      // 1. Get full device data
      const deviceResponse = await client.getDevice(devEui);
      const device = deviceResponse.device;

      // 2. Get device keys (catch NOT_FOUND for devices without keys)
      let appKey: string | undefined;
      try {
        const keysResponse = await client.getDeviceKeys(devEui);
        appKey = keysResponse.deviceKeys.appKey;
      } catch (err: unknown) {
        if (err instanceof ChirpStackApiError && err.code === 'NOT_FOUND') {
          // No keys for this device, that's fine
        } else {
          throw err;
        }
      }

      // 3. Delete device from source application
      await client.deleteDevice(devEui);

      try {
        // 4. Create device in destination application
        await client.createDevice({
          applicationId: destAppId,
          deviceProfileId: device.deviceProfileId,
          name: device.name,
          devEui: device.devEui,
          description: device.description,
          isDisabled: device.isDisabled,
          tags: device.tags,
        });

        // 5. Recreate keys if they existed
        if (appKey) {
          await client.createDeviceKeys(devEui, appKey);
        }

        migrated++;
      } catch (err: unknown) {
        // 6. Error at step 4 or 5: device potentially lost
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`WARNING: Device ${devEui} was deleted from source but failed to create in destination: ${message}`);
        errors.push({ devEui, message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ devEui, message });
    }
  }

  return { migrated, errors };
}

// ============================================
// bulkDelete — Delete multiple devices
// ============================================

export async function bulkDelete(
  devEuis: string[],
  client: ChirpStackClient,
): Promise<{ deleted: number; errors: Array<{ devEui: string; message: string }> }> {
  let deleted = 0;
  const errors: Array<{ devEui: string; message: string }> = [];

  for (const devEui of devEuis) {
    try {
      await client.deleteDevice(devEui);
      deleted++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ devEui, message });
    }
  }

  return { deleted, errors };
}

// ============================================
// bulkChangeProfile — Change device profile for multiple devices
// ============================================

export async function bulkChangeProfile(
  devEuis: string[],
  client: ChirpStackClient,
  newDeviceProfileId: string,
): Promise<{ updated: number; errors: Array<{ devEui: string; message: string }> }> {
  let updated = 0;
  const errors: Array<{ devEui: string; message: string }> = [];

  for (const devEui of devEuis) {
    try {
      // 1. Get current device data
      const deviceResponse = await client.getDevice(devEui);
      const device = deviceResponse.device;

      // 2. Update with new device profile
      await client.updateDevice(devEui, {
        applicationId: device.applicationId,
        deviceProfileId: newDeviceProfileId,
        name: device.name,
        devEui: device.devEui,
        description: device.description,
        isDisabled: device.isDisabled,
        tags: device.tags,
      });

      updated++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ devEui, message });
    }
  }

  return { updated, errors };
}

// ============================================
// bulkUpdateTags — Update tags for multiple devices
// ============================================

export async function bulkUpdateTags(
  data: Record<string, string>[],
  client: ChirpStackClient,
  mode: 'merge' | 'replace',
): Promise<{ updated: number; errors: Array<{ devEui: string; message: string }> }> {
  let updated = 0;
  const errors: Array<{ devEui: string; message: string }> = [];

  for (const row of data) {
    const devEui = (row['dev_eui'] ?? '').trim().toUpperCase();
    if (!devEui) {
      errors.push({ devEui: '', message: 'Missing dev_eui in row.' });
      continue;
    }

    // Extract tags: all keys except dev_eui
    const rowTags: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'dev_eui') {
        rowTags[key] = value;
      }
    }

    try {
      // 1. Get current device data
      const deviceResponse = await client.getDevice(devEui);
      const device = deviceResponse.device;

      // 2. Compute new tags based on mode
      let newTags: Record<string, string>;
      if (mode === 'merge') {
        newTags = { ...device.tags, ...rowTags };
      } else {
        newTags = rowTags;
      }

      // 3. Update device with new tags
      await client.updateDevice(devEui, {
        applicationId: device.applicationId,
        deviceProfileId: device.deviceProfileId,
        name: device.name,
        devEui: device.devEui,
        description: device.description,
        isDisabled: device.isDisabled,
        tags: newTags,
      });

      updated++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ devEui, message });
    }
  }

  return { updated, errors };
}
