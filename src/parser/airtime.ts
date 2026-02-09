// LoRa airtime calculation
// Based on Semtech SX1276/77/78/79 datasheet formulas

interface AirtimeParams {
  spreadingFactor: number;  // 7-12
  bandwidth: number;        // Hz (125000, 250000, 500000)
  payloadSize: number;      // bytes
  preambleSymbols?: number; // default 8
  codingRate?: number;      // 1-4 (4/5 to 4/8), default 1 (4/5)
  explicitHeader?: boolean; // default true
  lowDataRateOptimize?: boolean; // default auto
  crc?: boolean;           // default true
}

export function calculateAirtime(params: AirtimeParams): number {
  const {
    spreadingFactor: sf,
    bandwidth: bw,
    payloadSize: pl,
    preambleSymbols = 8,
    codingRate: cr = 1,
    explicitHeader = true,
    crc = true,
  } = params;

  // Low data rate optimization is mandatory for SF11/SF12 with BW125
  const lowDataRateOptimize = params.lowDataRateOptimize ??
    (sf >= 11 && bw <= 125000);

  // Symbol duration in microseconds
  const tSymbol = (Math.pow(2, sf) / bw) * 1_000_000;

  // Preamble duration
  const tPreamble = (preambleSymbols + 4.25) * tSymbol;

  // Payload symbol count calculation
  const de = lowDataRateOptimize ? 1 : 0;
  const ih = explicitHeader ? 0 : 1;
  const crcBits = crc ? 16 : 0;

  const payloadSymbNb = Math.max(
    Math.ceil(
      (8 * pl - 4 * sf + 28 + crcBits - 20 * ih) /
      (4 * (sf - 2 * de))
    ) * (cr + 4),
    0
  ) + 8;

  // Payload duration
  const tPayload = payloadSymbNb * tSymbol;

  // Total airtime in microseconds
  return Math.round(tPreamble + tPayload);
}

export function parseCodingRate(codr: string | undefined): number {
  switch (codr) {
    case '4/5': return 1;
    case '4/6': return 2;
    case '4/7': return 3;
    case '4/8': return 4;
    default: return 1;
  }
}

export function parseDataRate(datr: string | undefined): { sf: number; bw: number } | null {
  if (!datr) return null;

  // Parse "SF7BW125" format
  const match = datr.match(/SF(\d+)BW(\d+)/i);
  if (!match) return null;

  return {
    sf: parseInt(match[1], 10),
    bw: parseInt(match[2], 10) * 1000, // kHz to Hz
  };
}
