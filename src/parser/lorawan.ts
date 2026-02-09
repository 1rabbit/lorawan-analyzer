// LoRaWAN PHY payload parsing

export enum MType {
  JoinRequest = 0,
  JoinAccept = 1,
  UnconfirmedDataUp = 2,
  UnconfirmedDataDown = 3,
  ConfirmedDataUp = 4,
  ConfirmedDataDown = 5,
  RejoinRequest = 6,
  Proprietary = 7,
}

export interface ParsedPHYPayload {
  mtype: MType;
  major: number;

  // For data frames
  devAddr?: string;
  fCtrl?: number;
  fCnt?: number;
  fPort?: number;

  // For join requests
  joinEui?: string;
  devEui?: string;
  devNonce?: number;
}

export function parsePHYPayload(payload: Buffer): ParsedPHYPayload | null {
  if (payload.length < 1) return null;

  const mhdr = payload[0];
  const mtype = (mhdr >> 5) as MType;
  const major = mhdr & 0x03;

  const result: ParsedPHYPayload = { mtype, major };

  switch (mtype) {
    case MType.JoinRequest:
      return parseJoinRequest(payload, result);

    case MType.UnconfirmedDataUp:
    case MType.ConfirmedDataUp:
      return parseDataUplink(payload, result);

    default:
      return result;
  }
}

function parseJoinRequest(payload: Buffer, result: ParsedPHYPayload): ParsedPHYPayload | null {
  // Join Request: MHDR(1) + JoinEUI(8) + DevEUI(8) + DevNonce(2) + MIC(4) = 23 bytes
  if (payload.length < 23) return null;

  // JoinEUI is bytes 1-8 (little-endian, reverse for display)
  const joinEuiBytes = payload.subarray(1, 9);
  result.joinEui = Buffer.from(joinEuiBytes).reverse().toString('hex').toUpperCase();

  // DevEUI is bytes 9-16 (little-endian, reverse for display)
  const devEuiBytes = payload.subarray(9, 17);
  result.devEui = Buffer.from(devEuiBytes).reverse().toString('hex').toUpperCase();

  // DevNonce is bytes 17-18 (little-endian)
  result.devNonce = payload.readUInt16LE(17);

  return result;
}

function parseDataUplink(payload: Buffer, result: ParsedPHYPayload): ParsedPHYPayload | null {
  // Minimum data frame: MHDR(1) + DevAddr(4) + FCtrl(1) + FCnt(2) + MIC(4) = 12 bytes
  if (payload.length < 12) return null;

  // DevAddr is bytes 1-4 (little-endian, reverse for display as big-endian hex)
  const devAddrBytes = payload.subarray(1, 5);
  result.devAddr = Buffer.from(devAddrBytes).reverse().toString('hex').toUpperCase();

  // FCtrl is byte 5
  result.fCtrl = payload[5];

  // FCnt is bytes 6-7 (little-endian)
  result.fCnt = payload.readUInt16LE(6);

  // FPort is byte 8 if there's payload
  // Frame with FPort: MHDR(1) + DevAddr(4) + FCtrl(1) + FCnt(2) + FPort(1) + MIC(4) = 13 bytes minimum
  if (payload.length >= 13) {
    // Check FOpts length from FCtrl
    const fOptsLen = result.fCtrl & 0x0f;
    const fPortOffset = 8 + fOptsLen;

    if (payload.length > fPortOffset + 4) {  // +4 for MIC
      result.fPort = payload[fPortOffset];
    }
  }

  return result;
}

export function isDataUplink(mtype: MType): boolean {
  return mtype === MType.UnconfirmedDataUp || mtype === MType.ConfirmedDataUp;
}

export function isConfirmedUplink(mtype: MType): boolean {
  return mtype === MType.ConfirmedDataUp;
}

export function isJoinRequest(mtype: MType): boolean {
  return mtype === MType.JoinRequest;
}
