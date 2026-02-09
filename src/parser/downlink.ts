import type { ParsedPacket } from '../types.js';
import { calculateAirtime, parseCodingRate } from './airtime.js';
import { matchOperator } from '../operators/matcher.js';

// ChirpStack v4 DownlinkFrame structure (for JSON format)
// The /command/down topic uses this structure with items[] array
interface ChirpStackDownlinkFrame {
  phyPayload?: string;  // base64 encoded (legacy or within items)
  txInfo?: DownlinkTxInfo;
  gatewayId?: string;
  downlinkId?: number;
  // ChirpStack v4 wraps downlink info in items array
  items?: Array<{
    phyPayload?: string;
    txInfo?: DownlinkTxInfo;
  }>;
}

interface DownlinkTxInfo {
  frequency?: number;
  modulation?: {
    lora?: {
      bandwidth?: number;
      spreadingFactor?: number;
      codeRate?: string;
    };
  };
}

export function parseDownlinkFrame(
  frame: ChirpStackDownlinkFrame,
  timestamp: Date = new Date(),
  gatewayIdFromTopic?: string
): ParsedPacket | null {
  // ChirpStack v4 uses items[] array - extract first item
  let phyPayload = frame.phyPayload;
  let txInfo = frame.txInfo;

  if (frame.items && frame.items.length > 0) {
    const item = frame.items[0];
    phyPayload = item.phyPayload ?? phyPayload;
    txInfo = item.txInfo ?? txInfo;
  }

  if (!phyPayload) return null;

  const payload = Buffer.from(phyPayload, 'base64');
  const gatewayId = gatewayIdFromTopic ?? frame.gatewayId ?? 'unknown';
  const frequency = txInfo?.frequency ?? 0;
  const lora = txInfo?.modulation?.lora;
  const bandwidth = lora?.bandwidth ?? 125000;
  const spreadingFactor = lora?.spreadingFactor ?? null;
  const codingRate = lora?.codeRate;
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

  // Parse dev_addr from PHY payload if it's a data downlink
  // MHDR (1 byte) + DevAddr (4 bytes) for unconfirmed/confirmed data down
  let devAddr: string | null = null;
  let confirmed: boolean | null = null;
  if (payload.length >= 5) {
    const mhdr = payload[0];
    const mtype = (mhdr >> 5) & 0x07;
    // MType 3 = Unconfirmed Data Down, MType 5 = Confirmed Data Down
    if (mtype === 3 || mtype === 5) {
      devAddr = payload.subarray(1, 5).reverse().toString('hex').toUpperCase();
      confirmed = mtype === 5;
    }
  }

  return {
    timestamp,
    gateway_id: gatewayId,
    packet_type: 'downlink',
    dev_addr: devAddr,
    join_eui: null,
    dev_eui: null,
    operator: devAddr ? matchOperator(devAddr) : 'Unknown',
    frequency,
    spreading_factor: spreadingFactor,
    bandwidth,
    rssi: 0,  // TX doesn't have RSSI
    snr: 0,   // TX doesn't have SNR
    payload_size: payloadSize,
    airtime_us: airtimeUs,
    f_cnt: frame.downlinkId ?? null,  // Store downlink ID for correlation with tx_ack
    f_port: null,
    confirmed,
  };
}

// Parse protobuf DownlinkFrame
export function parseProtobufDownlink(data: Buffer, timestamp: Date = new Date(), gatewayIdFromTopic?: string): ParsedPacket | null {
  try {
    const frame = decodeDownlinkFrameProtobuf(data);
    return parseDownlinkFrame(frame, timestamp, gatewayIdFromTopic);
  } catch (err) {
    console.error('Downlink protobuf decode error:', err);
    return null;
  }
}

// Decode ChirpStack DownlinkFrame protobuf
// Based on chirpstack-api/gw/gw.proto DownlinkFrame message
// Field 3: downlink_id (uint32)
// Field 5: items (repeated DownlinkFrameItem)
// Field 7: gateway_id (string)
function decodeDownlinkFrameProtobuf(data: Buffer): ChirpStackDownlinkFrame {
  const frame: ChirpStackDownlinkFrame = {};
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
        if (fieldNumber === 3) { // downlink_id
          frame.downlinkId = value;
        }
        break;
      }
      case 2: { // Length-delimited
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        switch (fieldNumber) {
          case 7: // gateway_id (string)
            frame.gatewayId = fieldData.toString('utf-8');
            break;
          case 5: // items (repeated DownlinkFrameItem) - we take first one
            if (!frame.phyPayload) {
              const item = decodeDownlinkFrameItem(fieldData);
              frame.phyPayload = item.phyPayload;
              frame.txInfo = item.txInfo;
            }
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

interface DownlinkFrameItem {
  phyPayload?: string;
  txInfo?: ChirpStackDownlinkFrame['txInfo'];
}

// Decode DownlinkFrameItem message
// Field 1: phy_payload (bytes)
// Field 2: tx_info_legacy (deprecated)
// Field 3: tx_info (DownlinkTxInfo)
function decodeDownlinkFrameItem(data: Buffer): DownlinkFrameItem {
  const item: DownlinkFrameItem = {};
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

      switch (fieldNumber) {
        case 1: // phy_payload
          item.phyPayload = fieldData.toString('base64');
          break;
        case 3: // tx_info (field 2 is deprecated tx_info_legacy)
          item.txInfo = decodeTxInfoDownlink(fieldData);
          break;
      }
    } else if (wireType === 0) {
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else {
      break;
    }
  }

  return item;
}

// Decode DownlinkTxInfo message
// Field 1: frequency (uint32)
// Field 2: power (int32)
// Field 3: modulation (Modulation)
// Field 4: board (uint32)
// Field 5: antenna (uint32)
// Field 6: timing (Timing)
// Field 7: context (bytes)
function decodeTxInfoDownlink(data: Buffer): ChirpStackDownlinkFrame['txInfo'] {
  const txInfo: ChirpStackDownlinkFrame['txInfo'] = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    switch (wireType) {
      case 0: { // Varint (frequency, power, board, antenna)
        const [value, nextOffset] = readVarint(data, offset);
        offset = nextOffset;

        if (fieldNumber === 1) { // frequency
          txInfo.frequency = value;
        }
        // Skip other varints (power=2, board=4, antenna=5)
        break;
      }
      case 2: { // Length-delimited (modulation, timing, context)
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        if (fieldNumber === 3) { // modulation
          txInfo.modulation = decodeModulation(fieldData);
        }
        // Skip other length-delimited (timing=6, context=7)
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
      default: {
        // Unknown wire type, try to continue
        break;
      }
    }
  }

  return txInfo;
}

// Modulation message decoder
// Field 3: lora (LoraModulationInfo)
// Field 4: fsk (FskModulationInfo)
// Field 5: lr_fhss (LrFhssModulationInfo)
function decodeModulation(data: Buffer): NonNullable<ChirpStackDownlinkFrame['txInfo']>['modulation'] {
  const modulation: NonNullable<ChirpStackDownlinkFrame['txInfo']>['modulation'] = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) { // Length-delimited
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      const fieldData = data.subarray(offset, offset + length);
      offset += length;

      if (fieldNumber === 3) { // lora (field 3)
        modulation.lora = decodeLoraModulation(fieldData);
      }
      // Skip fsk=4, lr_fhss=5
    } else if (wireType === 0) { // Varint
      const [, nextOffset] = readVarint(data, offset);
      offset = nextOffset;
    } else if (wireType === 5) { // 32-bit
      offset += 4;
    } else if (wireType === 1) { // 64-bit
      offset += 8;
    }
    // Continue instead of breaking on unknown
  }

  return modulation;
}

function decodeLoraModulation(data: Buffer): NonNullable<NonNullable<ChirpStackDownlinkFrame['txInfo']>['modulation']>['lora'] {
  const lora: NonNullable<NonNullable<ChirpStackDownlinkFrame['txInfo']>['modulation']>['lora'] = {};
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
        case 5: lora.codeRate = decodeCodeRate(value); break;
      }
    } else if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      offset += length;
    } else {
      break;
    }
  }

  return lora;
}

function decodeCodeRate(value: number): string {
  const codeRates: Record<number, string> = {
    0: '4/5',
    1: '4/5',
    2: '4/6',
    3: '4/7',
    4: '4/8',
  };
  return codeRates[value] ?? '4/5';
}

function readVarint(data: Buffer, offset: number): [number, number] {
  let value = 0;
  let shift = 0;

  while (offset < data.length) {
    const byte = data[offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift >= 35) break;
  }

  return [value >>> 0, offset];
}
