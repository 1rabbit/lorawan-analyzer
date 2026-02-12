import { getOperatorPrefixes } from './prefixes.js';
import DEVICE_PREFIX_MAP from './device-prefixes.json';

export function matchOperator(devAddr: string): string {
  const devAddrNum = parseInt(devAddr, 16);

  for (const op of getOperatorPrefixes()) {
    if ((devAddrNum & op.mask) === (op.prefix & op.mask)) {
      return op.name;
    }
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

const typedPrefixMap: Array<{ prefix: string, operator: string, color?: string }> = DEVICE_PREFIX_MAP;

export function getDevicePrefixColorMap(): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const entry of typedPrefixMap) {
    if (entry.color) {
      colors[entry.operator] = entry.color;
    }
  }
  return colors;
}

export function matchOperatorForJoinEui(joinEui: string): string {
  const upperJoinEui = joinEui.toUpperCase();

  for (const { prefix, operator } of typedPrefixMap) {
    if (upperJoinEui.startsWith(prefix)) return operator;
  }

  const decoded = tryDecodeAscii(joinEui);
  return decoded ? 'Private' : 'Unknown';
}
