import type { ParsedPacket } from '../types.js';
import { parsePHYPayload, isDataUplink, isJoinRequest, isConfirmedUplink } from './lorawan.js';
import { calculateAirtime, parseCodingRate } from './airtime.js';
import { matchOperator, matchOperatorForJoinEui } from '../operators/matcher.js';

// ChirpStack UplinkFrame structure (for JSON format)
interface ChirpStackUplinkFrame {
  phyPayload?: string;  // base64 encoded
  txInfo?: {
    frequency?: number;
    modulation?: {
      lora?: {
        bandwidth?: number;
        spreadingFactor?: number;
        codeRate?: string;
      };
    };
  };
  rxInfo?: {
    gatewayId?: string;
    rssi?: number;
    snr?: number;
    time?: string;
    location?: { latitude: number; longitude: number; altitude?: number; name?: string };
    metadata?: Record<string, string>;
  };
}

export function parseUplinkFrame(
  frame: ChirpStackUplinkFrame,
  timestamp: Date = new Date()
): ParsedPacket | null {
  if (!frame.phyPayload) return null;

  const payload = Buffer.from(frame.phyPayload, 'base64');
  const parsed = parsePHYPayload(payload);
  if (!parsed) return null;

  const gatewayId = frame.rxInfo?.gatewayId ?? 'unknown';
  const frequency = frame.txInfo?.frequency ?? 0;
  const lora = frame.txInfo?.modulation?.lora;
  const bandwidth = lora?.bandwidth ?? 125000;
  const spreadingFactor = lora?.spreadingFactor ?? null;
  const codingRate = lora?.codeRate;
  const rssi = frame.rxInfo?.rssi ?? 0;
  const snr = frame.rxInfo?.snr ?? 0;
  const payloadSize = payload.length;

  // Calculate airtime if we have modulation info
  let airtimeUs = 0;
  if (spreadingFactor && bandwidth) {
    airtimeUs = calculateAirtime({
      spreadingFactor,
      bandwidth,
      payloadSize,
      codingRate: parseCodingRate(codingRate),
    });
  }

  if (isJoinRequest(parsed.mtype)) {
    return {
      timestamp,
      gateway_id: gatewayId,
      packet_type: 'join_request',
      dev_addr: null,
      join_eui: parsed.joinEui ?? null,
      dev_eui: parsed.devEui ?? null,
      operator: parsed.joinEui ? matchOperatorForJoinEui(parsed.joinEui) : 'Unknown',
      frequency,
      spreading_factor: spreadingFactor,
      bandwidth,
      rssi,
      snr,
      payload_size: payloadSize,
      airtime_us: airtimeUs,
      f_cnt: null,
      f_port: null,
      confirmed: null,
    };
  }

  if (isDataUplink(parsed.mtype)) {
    return {
      timestamp,
      gateway_id: gatewayId,
      packet_type: 'data',
      dev_addr: parsed.devAddr ?? null,
      join_eui: null,
      dev_eui: null,
      operator: parsed.devAddr ? matchOperator(parsed.devAddr) : 'Unknown',
      frequency,
      spreading_factor: spreadingFactor,
      bandwidth,
      rssi,
      snr,
      payload_size: payloadSize,
      airtime_us: airtimeUs,
      f_cnt: parsed.fCnt ?? null,
      f_port: parsed.fPort ?? null,
      confirmed: isConfirmedUplink(parsed.mtype),
    };
  }

  return null;
}

// Parse protobuf UplinkFrame using ChirpStack API types
export function parseProtobufUplink(data: Buffer, timestamp: Date = new Date()): ParsedPacket | null {
  try {
    // Import dynamically to avoid issues
    const frame = decodeUplinkFrameProtobuf(data);
    return parseUplinkFrame(frame, timestamp);
  } catch (err) {
    console.error('Protobuf decode error:', err);
    return null;
  }
}

// Decode ChirpStack UplinkFrame protobuf
// Based on chirpstack-api/gw/gw.proto
// Field numbers:
//   1: phyPayload (bytes)
//   4: txInfo (UplinkTxInfo) - new format
//   5: rxInfo (UplinkRxInfo) - new format
function decodeUplinkFrameProtobuf(data: Buffer): ChirpStackUplinkFrame {
  const frame: ChirpStackUplinkFrame = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: { // Varint
        const [, nextOffset] = readVarint(data, offset);
        offset = nextOffset;
        break;
      }
      case 2: { // Length-delimited
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        switch (fieldNumber) {
          case 1: // phy_payload
            frame.phyPayload = fieldData.toString('base64');
            break;
          case 4: // tx_info (new format)
            frame.txInfo = decodeTxInfo(fieldData);
            break;
          case 5: // rx_info (new format)
            frame.rxInfo = decodeRxInfo(fieldData);
            break;
        }
        break;
      }
      case 5: { // 32-bit fixed
        offset += 4;
        break;
      }
      case 1: { // 64-bit fixed
        offset += 8;
        break;
      }
      default:
        return frame;
    }
  }

  return frame;
}

function decodeTxInfo(data: Buffer): ChirpStackUplinkFrame['txInfo'] {
  const txInfo: ChirpStackUplinkFrame['txInfo'] = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: { // Varint
        const [value, nextOffset] = readVarint(data, offset);
        offset = nextOffset;

        if (fieldNumber === 1) { // frequency
          txInfo.frequency = value;
        }
        break;
      }
      case 2: { // Length-delimited
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        if (fieldNumber === 2) { // modulation
          txInfo.modulation = decodeModulation(fieldData);
        }
        break;
      }
      default:
        return txInfo;
    }
  }

  return txInfo;
}

// Modulation message:
//   Field 3: lora (LoraModulationInfo)
//   Field 4: fsk (FskModulationInfo)
//   Field 5: lrFhss (LrFhssModulationInfo)
function decodeModulation(data: Buffer): NonNullable<NonNullable<ChirpStackUplinkFrame['txInfo']>['modulation']> {
  const modulation: NonNullable<NonNullable<ChirpStackUplinkFrame['txInfo']>['modulation']> = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      if (fieldNumber === 3) { // lora (field 3)
        modulation.lora = decodeLoraModulation(fieldData);
      }
    } else if (wireType === 0) {
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else {
      break;
    }
  }

  return modulation;
}

// LoraModulationInfo message:
//   Field 1: bandwidth (uint32)
//   Field 2: spreadingFactor (uint32)
//   Field 3: codeRateLegacy (string) - deprecated
//   Field 5: codeRate (enum CodeRate)
function decodeLoraModulation(data: Buffer): NonNullable<NonNullable<NonNullable<ChirpStackUplinkFrame['txInfo']>['modulation']>['lora']> {
  const lora: NonNullable<NonNullable<NonNullable<ChirpStackUplinkFrame['txInfo']>['modulation']>['lora']> = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      const [value, nextOffset] = readVarint(data, offset);
      offset = nextOffset;

      switch (fieldNumber) {
        case 1: lora.bandwidth = value; break;
        case 2: lora.spreadingFactor = value; break;
        case 5: lora.codeRate = decodeCodeRate(value); break;  // codeRate is field 5
      }
    } else if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      // Field 3 is codeRateLegacy (string), skip it
      offset += length;
    } else {
      break;
    }
  }

  return lora;
}

function decodeCodeRate(value: number): string {
  const codeRates: Record<number, string> = {
    0: '4/5',  // CR_UNDEFINED
    1: '4/5',  // CR_4_5
    2: '4/6',  // CR_4_6
    3: '4/7',  // CR_4_7
    4: '4/8',  // CR_4_8
  };
  return codeRates[value] ?? '4/5';
}

// common.Location message:
//   Field 1: latitude (double)
//   Field 2: longitude (double)
//   Field 3: altitude (double)
function decodeLocation(data: Buffer): { latitude: number; longitude: number; altitude?: number } | null {
  const loc: { latitude: number; longitude: number; altitude?: number } = { latitude: 0, longitude: 0 };
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 1) { // 64-bit fixed (double)
      const value = data.readDoubleLE(offset);
      offset += 8;
      switch (fieldNumber) {
        case 1: loc.latitude = value; break;
        case 2: loc.longitude = value; break;
        case 3: loc.altitude = value; break;
      }
    } else if (wireType === 0) {
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset + length;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }

  // Only return if we got valid coordinates
  if (loc.latitude === 0 && loc.longitude === 0) return null;
  return loc;
}

// Decode a protobuf map<string,string> entry (field 1 = key, field 2 = value)
function decodeMapEntry(data: Buffer): [string, string] | null {
  let key = '';
  let value = '';
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      const str = data.subarray(offset, offset + length).toString('utf-8');
      offset += length;
      if (fieldNumber === 1) key = str;
      else if (fieldNumber === 2) value = str;
    } else if (wireType === 0) {
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else {
      break;
    }
  }

  return key ? [key, value] : null;
}

// UplinkRxInfo message (from gw.proto):
//   Field 1: gatewayId (string)
//   Field 2: uplinkId (uint32)
//   Field 3: gwTime (Timestamp)
//   Field 6: rssi (int32) - negative values use 10-byte varint encoding
//   Field 7: snr (float)
//   Field 12: location (common.Location)
//   Field 15: metadata (map<string,string>) - Helium uses gateway_lat/gateway_long here
function decodeRxInfo(data: Buffer): ChirpStackUplinkFrame['rxInfo'] {
  const rxInfo: ChirpStackUplinkFrame['rxInfo'] = {};
  const metadata: Record<string, string> = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: { // Varint
        // Use BigInt for ALL varints to safely handle negative int32 (10-byte encoding)
        const [value, nextOffset] = readVarintBigInt(data, offset);
        offset = nextOffset;
        if (fieldNumber === 6) {
          rxInfo.rssi = bigIntToSigned32(value);
        }
        break;
      }
      case 2: { // Length-delimited
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        if (fieldNumber === 1) { // gateway_id (string)
          rxInfo.gatewayId = fieldData.toString('utf-8');
        } else if (fieldNumber === 12) { // location
          const loc = decodeLocation(fieldData);
          if (loc) rxInfo.location = loc;
        } else if (fieldNumber === 15) { // metadata map entry
          const entry = decodeMapEntry(fieldData);
          if (entry) metadata[entry[0]] = entry[1];
        }
        break;
      }
      case 5: { // 32-bit fixed (float for snr)
        if (fieldNumber === 7) {  // snr is field 7
          rxInfo.snr = data.readFloatLE(offset);
        }
        offset += 4;
        break;
      }
      case 1: { // 64-bit fixed
        offset += 8;
        break;
      }
      default:
        return rxInfo;
    }
  }

  // Store metadata if any entries were found
  if (Object.keys(metadata).length > 0) {
    rxInfo.metadata = metadata;
  }

  // Fallback: if no location from field 9, try Helium metadata
  if (!rxInfo.location && metadata.gateway_lat && metadata.gateway_long) {
    const lat = parseFloat(metadata.gateway_lat);
    const lng = parseFloat(metadata.gateway_long);
    if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
      rxInfo.location = { latitude: lat, longitude: lng };
    }
  }

  // Attach gateway_name from metadata to location if available
  if (rxInfo.location && metadata.gateway_name) {
    rxInfo.location.name = metadata.gateway_name;
  }

  return rxInfo;
}

function readVarint(data: Buffer, offset: number): [number, number] {
  let value = 0;
  let shift = 0;

  while (offset < data.length) {
    const byte = data[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    // Stop at 32-bit value for most fields
    if (shift >= 35) break;
  }

  return [value >>> 0, offset];
}

// Read varint as BigInt to handle negative int32 (10-byte encoding)
function readVarintBigInt(data: Buffer, offset: number): [bigint, number] {
  let value = BigInt(0);
  let shift = BigInt(0);

  while (offset < data.length) {
    const byte = data[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += BigInt(7);
  }

  return [value, offset];
}

function toSigned32(value: number): number {
  return value | 0;
}

// Convert BigInt varint to signed int32
function bigIntToSigned32(value: bigint): number {
  // Truncate to 32 bits and interpret as signed
  return Number(BigInt.asIntN(32, value));
}

export type GatewayLocation = { latitude: number; longitude: number; altitude?: number; name?: string };

// Try to extract location from a single rxInfo entry (object)
function extractLocationFromRxInfoEntry(entry: Record<string, unknown>): GatewayLocation | null {
  // Try location field first
  const loc = entry.location as Record<string, unknown> | undefined;
  if (loc) {
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
      const result: GatewayLocation = { latitude: lat, longitude: lng };
      if (loc.altitude !== undefined && loc.altitude !== null) {
        result.altitude = Number(loc.altitude);
      }
      return result;
    }
  }

  // Fallback: Helium metadata (gateway_lat / gateway_long / gateway_name)
  const meta = entry.metadata as Record<string, string> | undefined;
  if (meta?.gateway_lat && meta?.gateway_long) {
    const lat = parseFloat(meta.gateway_lat);
    const lng = parseFloat(meta.gateway_long);
    if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
      const result: GatewayLocation = { latitude: lat, longitude: lng };
      if (meta.gateway_name) result.name = meta.gateway_name;
      return result;
    }
  }

  return null;
}

// Extract gateway locations from a JSON uplink frame
// Returns a map of gateway_id -> location for all gateways with coordinates
export function extractGatewayLocationsFromJSON(frame: Record<string, unknown>): Map<string, GatewayLocation> {
  const locations = new Map<string, GatewayLocation>();
  const rxInfo = frame.rxInfo;
  if (!rxInfo) return locations;

  // rxInfo can be a single object or an array
  const entries = Array.isArray(rxInfo) ? rxInfo : [rxInfo];
  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const gwId = e.gatewayId as string | undefined;
    if (!gwId || locations.has(gwId)) continue;
    const loc = extractLocationFromRxInfoEntry(e);
    if (loc) locations.set(gwId, loc);
  }

  return locations;
}

// Extract gateway location from a JSON uplink frame (single gateway, for protobuf gateway topic)
export function extractGatewayLocationFromJSON(frame: Record<string, unknown>): GatewayLocation | null {
  const rxInfo = frame.rxInfo;
  if (!rxInfo) return null;

  // If array, find first entry with location
  if (Array.isArray(rxInfo)) {
    for (const entry of rxInfo) {
      const loc = extractLocationFromRxInfoEntry(entry as Record<string, unknown>);
      if (loc) return loc;
    }
    return null;
  }

  return extractLocationFromRxInfoEntry(rxInfo as Record<string, unknown>);
}

// Extract gateway location from a protobuf uplink frame
export function extractGatewayLocationFromProtobuf(data: Buffer): GatewayLocation | null {
  try {
    const frame = decodeUplinkFrameProtobuf(data);
    return frame.rxInfo?.location ?? null;
  } catch {
    return null;
  }
}
