import type { ParsedPacket } from '../types.js';

// TxAckStatus enum from ChirpStack
export enum TxAckStatus {
  IGNORED = 0,
  OK = 1,
  TOO_LATE = 2,
  TOO_EARLY = 3,
  COLLISION_PACKET = 4,
  COLLISION_BEACON = 5,
  TX_FREQ = 6,
  TX_POWER = 7,
  GPS_UNLOCKED = 8,
  QUEUE_FULL = 9,
  INTERNAL_ERROR = 10,
  DUTY_CYCLE_OVERFLOW = 11,
}

export const TxAckStatusNames: Record<number, string> = {
  [TxAckStatus.IGNORED]: 'IGNORED',
  [TxAckStatus.OK]: 'ACK',
  [TxAckStatus.TOO_LATE]: 'TOO_LATE',
  [TxAckStatus.TOO_EARLY]: 'TOO_EARLY',
  [TxAckStatus.COLLISION_PACKET]: 'COLLISION_PACKET',
  [TxAckStatus.COLLISION_BEACON]: 'COLLISION_BEACON',
  [TxAckStatus.TX_FREQ]: 'TX_FREQ',
  [TxAckStatus.TX_POWER]: 'TX_POWER',
  [TxAckStatus.GPS_UNLOCKED]: 'GPS_UNLOCKED',
  [TxAckStatus.QUEUE_FULL]: 'QUEUE_FULL',
  [TxAckStatus.INTERNAL_ERROR]: 'INTERNAL_ERROR',
  [TxAckStatus.DUTY_CYCLE_OVERFLOW]: 'DUTY_CYCLE_OVERFLOW',
};

// ChirpStack DownlinkTxAck structure (JSON format)
interface ChirpStackTxAck {
  gatewayId?: string;
  downlinkId?: number;
  items?: Array<{
    status?: TxAckStatus | string;
  }>;
}

export function parseTxAck(
  ack: ChirpStackTxAck,
  timestamp: Date = new Date(),
  gatewayIdFromTopic?: string
): ParsedPacket | null {
  const gatewayId = gatewayIdFromTopic ?? ack.gatewayId ?? 'unknown';

  // Get status from first item
  let status = TxAckStatus.OK;
  if (ack.items && ack.items.length > 0) {
    const itemStatus = ack.items[0].status;
    if (typeof itemStatus === 'number') {
      status = itemStatus;
    } else if (typeof itemStatus === 'string') {
      // Handle string status (e.g., "OK", "TOO_LATE")
      const statusKey = itemStatus.toUpperCase() as keyof typeof TxAckStatus;
      status = TxAckStatus[statusKey] ?? TxAckStatus.OK;
    }
  }

  // Create a packet record for the TX ack
  // We use packet_type 'tx_ack' to distinguish from scheduled downlinks
  return {
    timestamp,
    gateway_id: gatewayId,
    packet_type: 'tx_ack',
    dev_addr: null,
    join_eui: null,
    dev_eui: null,
    operator: TxAckStatusNames[status] ?? 'UNKNOWN',  // Store status in operator field
    frequency: 0,
    spreading_factor: null,
    bandwidth: 125000,
    rssi: 0,
    snr: 0,
    payload_size: 0,
    airtime_us: 0,
    f_cnt: ack.downlinkId ?? null,  // Store downlink ID for correlation
    f_port: status,  // Store status code in f_port for easy querying
    confirmed: null,
  };
}

// Parse protobuf DownlinkTxAck
export function parseProtobufTxAck(
  data: Buffer,
  timestamp: Date = new Date(),
  gatewayIdFromTopic?: string
): ParsedPacket | null {
  try {
    const ack = decodeDownlinkTxAckProtobuf(data);
    return parseTxAck(ack, timestamp, gatewayIdFromTopic);
  } catch (err) {
    console.error('TxAck protobuf decode error:', err);
    return null;
  }
}

// Decode ChirpStack DownlinkTxAck protobuf
// Based on chirpstack-api/gw/gw.proto DownlinkTxAck message
function decodeDownlinkTxAckProtobuf(data: Buffer): ChirpStackTxAck {
  const ack: ChirpStackTxAck = { items: [] };
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
        if (fieldNumber === 2) { // downlink_id (uint32)
          ack.downlinkId = value;
        }
        break;
      }
      case 2: { // Length-delimited
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;

        switch (fieldNumber) {
          case 6: // gateway_id (string)
            ack.gatewayId = fieldData.toString('utf-8');
            break;
          case 5: // items (repeated DownlinkTxAckItem)
            const item = decodeDownlinkTxAckItem(fieldData);
            ack.items!.push(item);
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
        return ack;
    }
  }

  return ack;
}

interface DownlinkTxAckItem {
  status?: TxAckStatus;
}

function decodeDownlinkTxAckItem(data: Buffer): DownlinkTxAckItem {
  const item: DownlinkTxAckItem = {};
  let offset = 0;

  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;

    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      const [value, nextOffset] = readVarint(data, offset);
      offset = nextOffset;

      if (fieldNumber === 1) { // status
        item.status = value as TxAckStatus;
      }
    } else if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      offset += length;
    } else {
      break;
    }
  }

  return item;
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
