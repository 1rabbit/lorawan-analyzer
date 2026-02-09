import { getOperatorPrefixes } from './prefixes.js';

export function matchOperator(devAddr: string): string {
  const devAddrNum = parseInt(devAddr, 16);

  for (const op of getOperatorPrefixes()) {
    if ((devAddrNum & op.mask) === (op.prefix & op.mask)) {
      return op.name;
    }
  }

  return 'Unknown';
}

export function matchOperatorForJoinEui(joinEui: string): string {
  // Join EUI doesn't directly map to operators, but we can identify some
  // common manufacturers/networks by their OUI (IEEE assigned prefixes)

  const upperJoinEui = joinEui.toUpperCase();

  // TTN JoinEUI ranges (70B3D57ED... and 70B3D58...)
  if (upperJoinEui.startsWith('70B3D57ED') || upperJoinEui.startsWith('70B3D58')) {
    return 'The Things Network';
  }

  // Helium JoinEUI
  if (upperJoinEui.startsWith('6081F9')) {
    return 'Helium';
  }

  // Actility
  if (upperJoinEui.startsWith('0016C0')) {
    return 'Actility';
  }

  // Semtech
  if (upperJoinEui.startsWith('00250C')) {
    return 'Semtech';
  }

  // Microchip (ATECC608)
  if (upperJoinEui.startsWith('0004A3')) {
    return 'Microchip';
  }

  // RAK Wireless
  if (upperJoinEui.startsWith('AC1F09')) {
    return 'RAK Wireless';
  }

  // Seeed Studio
  if (upperJoinEui.startsWith('2CF7F1')) {
    return 'Seeed Studio';
  }

  // Dragino
  if (upperJoinEui.startsWith('A84041')) {
    return 'Dragino';
  }

  // Kerlink
  if (upperJoinEui.startsWith('7076FF')) {
    return 'Kerlink';
  }

  // Custom/Private - check if it looks like ASCII text (often indicates private JoinEUIs)
  const decoded = tryDecodeAscii(joinEui);
  if (decoded) {
    return 'Private';
  }

  return 'Unknown';
}

// Try to decode a hex string as ASCII to detect custom private JoinEUIs
function tryDecodeAscii(hex: string): string | null {
  if (hex.length !== 16) return null;

  try {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substring(i, i + 2), 16);
      // Check if it's a printable ASCII character (0x20-0x7E)
      if (charCode >= 0x20 && charCode <= 0x7E) {
        result += String.fromCharCode(charCode);
      } else {
        return null;
      }
    }
    return result;
  } catch {
    return null;
  }
}
