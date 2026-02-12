import type { ImportProfile, ValidationResult } from '../types.js';
import type { ChirpStackClient } from '../chirpstack/client.js';
import { ChirpStackApiError } from '../chirpstack/client.js';

// ============================================
// Individual field validators
// ============================================

const DEV_EUI_REGEX = /^[0-9a-fA-F]{16}$/;
const APP_KEY_REGEX = /^[0-9a-fA-F]{32}$/;

/**
 * Validate a DevEUI: exactly 16 hexadecimal characters.
 */
export function validateDevEui(value: string): boolean {
  return DEV_EUI_REGEX.test(value);
}

/**
 * Validate an AppKey: exactly 32 hexadecimal characters.
 */
export function validateAppKey(value: string): boolean {
  return APP_KEY_REGEX.test(value);
}

// ============================================
// Row validation
// ============================================

interface RowValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: string[];
}

/**
 * Validate a single CSV row against the column mapping and optional import profile.
 *
 * - dev_eui: must be present and valid hex (16 chars)
 * - app_key: if present, must be valid hex (32 chars)
 * - name: optional, but generates a warning if empty
 * - requiredTags from profile: all must be present and non-empty
 * - device_profile_id: must be present if no default provided via profile
 */
export function validateRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
  profile?: ImportProfile,
  defaultDeviceProfileId?: string,
): RowValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: string[] = [];

  // Helper: resolve a logical field name to its CSV column value
  const getField = (logicalName: string): string | undefined => {
    const csvColumn = mapping[logicalName];
    if (!csvColumn) return undefined;
    return row[csvColumn];
  };

  // --- dev_eui: required + valid format ---
  const devEui = getField('dev_eui');
  if (!devEui || devEui.trim() === '') {
    errors.push({ field: 'dev_eui', message: 'DevEUI is required.' });
  } else if (!validateDevEui(devEui.trim())) {
    errors.push({ field: 'dev_eui', message: `Invalid DevEUI format: "${devEui}". Must be exactly 16 hex characters.` });
  }

  // --- app_key: optional, but if present must be valid ---
  const appKey = getField('app_key');
  if (appKey !== undefined && appKey.trim() !== '') {
    if (!validateAppKey(appKey.trim())) {
      errors.push({ field: 'app_key', message: `Invalid AppKey format: "${appKey}". Must be exactly 32 hex characters.` });
    }
  }

  // --- name: optional, warning if empty ---
  const name = getField('name');
  if (name === undefined || name.trim() === '') {
    warnings.push('Device name is empty. A name will need to be auto-generated.');
  }

  // --- requiredTags from profile ---
  if (profile) {
    for (const tag of profile.required_tags) {
      const tagValue = getField(tag);
      if (tagValue === undefined || tagValue.trim() === '') {
        errors.push({ field: tag, message: `Required tag "${tag}" is missing or empty.` });
      }
    }
  }

  // --- device_profile_id: required if no default provided via selector ---
  const deviceProfileId = getField('device_profile_id');
  if ((!deviceProfileId || deviceProfileId.trim() === '') && !defaultDeviceProfileId) {
    errors.push({ field: 'device_profile_id', message: 'Device profile ID is required.' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// Duplicate checking
// ============================================

const BATCH_SIZE = 10;

/**
 * Check for duplicate devices on the ChirpStack server.
 * Batches requests in groups of 10 using Promise.allSettled for performance.
 *
 * Returns an array of duplicates found (devices that already exist on the server).
 */
export async function checkDuplicates(
  devEuis: string[],
  client: ChirpStackClient,
): Promise<Array<{ devEui: string; existingName: string }>> {
  const duplicates: Array<{ devEui: string; existingName: string }> = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < devEuis.length; i += BATCH_SIZE) {
    const batch = devEuis.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (devEui) => {
        const response = await client.getDevice(devEui);
        return { devEui, existingName: response.device.name };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        // Device exists -> duplicate
        duplicates.push(result.value);
      } else {
        // Check if it's a NOT_FOUND error (expected for non-duplicates)
        const reason = result.reason;
        if (reason instanceof ChirpStackApiError && reason.code === 'NOT_FOUND') {
          // Not a duplicate, this is the expected case
          continue;
        }
        // For any other error, re-throw (network issues, auth failures, etc.)
        throw reason;
      }
    }
  }

  return duplicates;
}

// ============================================
// Full import data validation
// ============================================

/**
 * Validate an entire import dataset:
 * 1. Validates each row using validateRow
 * 2. Collects all devEuis that passed validation
 * 3. Calls checkDuplicates on them
 * 4. Returns aggregated ValidationResult
 */
export async function validateImportData(params: {
  data: Record<string, string>[];
  mapping: Record<string, string>;
  profile?: ImportProfile;
  client: ChirpStackClient;
  deviceProfileId?: string;
}): Promise<ValidationResult> {
  const { data, mapping, profile, client, deviceProfileId } = params;

  const allErrors: Array<{ row: number; field: string; message: string }> = [];
  const allWarnings: string[] = [];
  const validDevEuis: Array<{ devEui: string; rowIndex: number }> = [];

  // Step 1: Validate each row
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const result = validateRow(row, mapping, profile, deviceProfileId);

    // Add row-level errors
    for (const error of result.errors) {
      allErrors.push({ row: i + 1, field: error.field, message: error.message });
    }

    // Add warnings with row context
    for (const warning of result.warnings) {
      allWarnings.push(`Row ${i + 1}: ${warning}`);
    }

    // If valid, collect the devEui for duplicate checking
    if (result.valid) {
      const devEuiColumn = mapping['dev_eui'];
      const devEui = row[devEuiColumn]?.trim();
      if (devEui) {
        validDevEuis.push({ devEui, rowIndex: i });
      }
    }
  }

  // Step 2: Check duplicates for valid devEuis
  const devEuiList = validDevEuis.map((v) => v.devEui);
  const rawDuplicates = await checkDuplicates(devEuiList, client);

  // Step 3: Build duplicate results with csv_name from mapping
  const nameColumn = mapping['name'];
  const duplicates = rawDuplicates.map((dup) => {
    const entry = validDevEuis.find((v) => v.devEui === dup.devEui);
    const csvName = entry !== undefined && nameColumn
      ? (data[entry.rowIndex][nameColumn]?.trim() || '')
      : '';

    return {
      dev_eui: dup.devEui,
      existing_name: dup.existingName,
      csv_name: csvName,
    };
  });

  // Step 4: Calculate valid count (rows that passed validation minus duplicates)
  const duplicateDevEuis = new Set(rawDuplicates.map((d) => d.devEui));
  const validCount = validDevEuis.filter((v) => !duplicateDevEuis.has(v.devEui)).length;

  return {
    valid: validCount,
    errors: allErrors,
    duplicates,
    warnings: allWarnings,
  };
}
