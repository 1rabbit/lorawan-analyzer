// Built-in LoRaWAN operator prefixes from TTN NetID assignments
// Format: DevAddr prefix -> Operator name
// Prefixes are in the format "AABBCCDD/bits" where bits is the prefix length

export interface OperatorPrefix {
  prefix: number;
  mask: number;
  bits: number;
  name: string;
  priority: number;
}

// Parse a prefix string like "26000000/7" into prefix and mask
function parsePrefix(prefixStr: string): { prefix: number; mask: number; bits: number } {
  const [hexPart, bitsStr] = prefixStr.split('/');
  const prefix = parseInt(hexPart, 16);
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { prefix, mask, bits };
}

// Built-in operator database from LoRa Alliance NetID assignments
const BUILTIN_OPERATORS: Array<{ prefix: string; name: string }> = [
  // ==========================================
  // Type 0 NetIDs (6-bit NwkID) - /7 prefix
  // ==========================================
  { prefix: '00000000/7', name: 'Private' },  // NetID 0x000000
  { prefix: '02000000/7', name: 'Private' },  // NetID 0x000001
  { prefix: '04000000/7', name: 'Actility' },              // NetID 0x000002
  { prefix: '06000000/7', name: 'Proximus' },              // NetID 0x000003
  { prefix: '08000000/7', name: 'Swisscom' },              // NetID 0x000004
  { prefix: '0E000000/7', name: 'Bouygues Telecom' },      // NetID 0x000007
  { prefix: '10000000/7', name: 'Orbiwise' },              // NetID 0x000008
  { prefix: '12000000/7', name: 'SENET' },                 // NetID 0x000009
  { prefix: '14000000/7', name: 'KPN' },                   // NetID 0x00000A
  { prefix: '16000000/7', name: 'EveryNet' },              // NetID 0x00000B
  { prefix: '1A000000/7', name: 'SK Telecom' },            // NetID 0x00000D
  { prefix: '1C000000/7', name: 'SagemCom' },              // NetID 0x00000E
  { prefix: '1E000000/7', name: 'Orange' },                // NetID 0x00000F
  { prefix: '20000000/7', name: 'A2A Smart City' },        // NetID 0x000010
  { prefix: '24000000/7', name: 'Kerlink' },               // NetID 0x000012
  { prefix: '26000000/7', name: 'The Things Network' },    // NetID 0x000013
  { prefix: '2A000000/7', name: 'Cisco Systems' },         // NetID 0x000015
  { prefix: '2E000000/7', name: 'MultiTech Systems' },     // NetID 0x000017
  { prefix: '30000000/7', name: 'Loriot' },                // NetID 0x000018
  { prefix: '32000000/7', name: 'NNNCo' },                 // NetID 0x000019
  { prefix: '3E000000/7', name: 'Axatel' },                // NetID 0x00001F
  { prefix: '44000000/7', name: 'Comcast' },               // NetID 0x000022
  { prefix: '46000000/7', name: 'Ventia' },                // NetID 0x000023
  { prefix: '60000000/7', name: 'SoftBank' },              // NetID 0x000030
  { prefix: '6A000000/7', name: 'Tencent' },               // NetID 0x000035
  { prefix: '6C000000/7', name: 'Netze BW' },              // NetID 0x000036
  { prefix: '6E000000/7', name: 'Tektelic' },              // NetID 0x000037
  { prefix: '70000000/7', name: 'Charter Communication' }, // NetID 0x000038
  { prefix: '72000000/7', name: 'Amazon' },                // NetID 0x000039

  // ==========================================
  // Type 3 NetIDs (11-bit NwkID) - /15 prefix
  // ==========================================
  { prefix: 'E0020000/15', name: 'Digita' },               // NetID 0x600001
  { prefix: 'E0040000/15', name: 'Netmore' },              // NetID 0x600002
  { prefix: 'E0060000/15', name: 'QuaeNet' },              // NetID 0x600003
  { prefix: 'E0080000/15', name: 'eleven-x' },             // NetID 0x600004
  { prefix: 'E00A0000/15', name: 'IoT Network AS' },       // NetID 0x600005
  { prefix: 'E00E0000/15', name: 'EDF' },                  // NetID 0x600007
  { prefix: 'E0100000/15', name: 'Unidata' },              // NetID 0x600008
  { prefix: 'E0140000/15', name: 'Öresundskraft' },        // NetID 0x60000A
  { prefix: 'E01C0000/15', name: 'Spark' },                // NetID 0x60000E
  { prefix: 'E0200000/15', name: 'Senet' },                // NetID 0x600010
  { prefix: 'E0260000/15', name: 'Actility' },             // NetID 0x600013
  { prefix: 'E0280000/15', name: 'Kerlink' },              // NetID 0x600014
  { prefix: 'E02C0000/15', name: 'Cisco' },                // NetID 0x600016
  { prefix: 'E02E0000/15', name: 'Schneider Electric' },   // NetID 0x600017
  { prefix: 'E0300000/15', name: 'Minol ZENNER' },         // NetID 0x600018
  { prefix: 'E0340000/15', name: 'NEC' },                  // NetID 0x60001A
  { prefix: 'E0360000/15', name: 'Tencent' },              // NetID 0x60001B
  { prefix: 'E0380000/15', name: 'MachineQ/Comcast' },     // NetID 0x60001C
  { prefix: 'E03A0000/15', name: 'NTT' },                  // NetID 0x60001D
  { prefix: 'E03E0000/15', name: 'KPN' },                  // NetID 0x60001F
  { prefix: 'E0400000/15', name: 'Spectrum' },             // NetID 0x600020
  { prefix: 'E0420000/15', name: 'Microshare' },           // NetID 0x600021
  { prefix: 'E0480000/15', name: 'Netze BW' },             // NetID 0x600024
  { prefix: 'E04A0000/15', name: 'Tektelic' },             // NetID 0x600025
  { prefix: 'E04E0000/15', name: 'Birdz' },                // NetID 0x600027
  { prefix: 'E0500000/15', name: 'Charter Communication' },// NetID 0x600028
  { prefix: 'E0520000/15', name: 'Machines Talk' },        // NetID 0x600029
  { prefix: 'E0540000/15', name: 'Neptune Technology' },   // NetID 0x60002A
  { prefix: 'E0560000/15', name: 'Amazon' },               // NetID 0x60002B
  { prefix: 'E0580000/15', name: 'myDevices' },            // NetID 0x60002C
  { prefix: 'E05A0000/15', name: 'Helium' },               // NetID 0x60002D (Decentralized Wireless Foundation)
  { prefix: 'E05C0000/15', name: 'Eutelsat' },             // NetID 0x60002E

  // ==========================================
  // Type 6 NetIDs (15-bit NwkID) - /22 prefix
  // ==========================================
  { prefix: 'FC000800/22', name: 'ResIOT' },               // NetID 0xC00002
  { prefix: 'FC000C00/22', name: 'SYSDEV' },               // NetID 0xC00003
  { prefix: 'FC001400/22', name: 'Macnica' },              // NetID 0xC00005
  { prefix: 'FC002000/22', name: 'Definium' },             // NetID 0xC00008
  { prefix: 'FC002800/22', name: 'SenseWay' },             // NetID 0xC0000A
  { prefix: 'FC002C00/22', name: '3S' },                   // NetID 0xC0000B
  { prefix: 'FC003400/22', name: 'Packetworx' },           // NetID 0xC0000D
  { prefix: 'FC003C00/22', name: 'Antenna Hungaria' },     // NetID 0xC0000F
  { prefix: 'FC004800/22', name: 'Netmore' },              // NetID 0xC00012
  { prefix: 'FC004C00/22', name: 'Lyse AS' },              // NetID 0xC00013
  { prefix: 'FC005000/22', name: 'VTC Digicom' },          // NetID 0xC00014
  { prefix: 'FC005400/22', name: 'Machines Talk' },        // NetID 0xC00015
  { prefix: 'FC005800/22', name: 'Schneider Electric' },   // NetID 0xC00016
  { prefix: 'FC005C00/22', name: 'Connexin' },             // NetID 0xC00017
  { prefix: 'FC006000/22', name: 'Minol ZENNER' },         // NetID 0xC00018
  { prefix: 'FC006400/22', name: 'Telekom Srbija' },       // NetID 0xC00019
  { prefix: 'FC006800/22', name: 'REQUEA' },               // NetID 0xC0001A
  { prefix: 'FC006C00/22', name: 'Sensor Network Services' }, // NetID 0xC0001B
  { prefix: 'FC007400/22', name: 'Boston Networks' },      // NetID 0xC0001D
  { prefix: 'FC007C00/22', name: 'mcf88' },                // NetID 0xC0001F
  { prefix: 'FC008000/22', name: 'NEC' },                  // NetID 0xC00020
  { prefix: 'FC008400/22', name: 'Hiber' },                // NetID 0xC00021
  { prefix: 'FC009000/22', name: 'NTT' },                  // NetID 0xC00024
  { prefix: 'FC009400/22', name: 'ICFOSS' },               // NetID 0xC00025
  { prefix: 'FC00A000/22', name: 'Lacuna Space' },         // NetID 0xC00028
  { prefix: 'FC00A400/22', name: 'Andorra Telecom' },      // NetID 0xC00029
  { prefix: 'FC00A800/22', name: 'Milesight' },            // NetID 0xC0002A
  { prefix: 'FC00AC00/22', name: 'Grenoble Alps University' }, // NetID 0xC0002B
  { prefix: 'FC00B800/22', name: 'Spectrum' },             // NetID 0xC0002E
  { prefix: 'FC00BC00/22', name: 'Afnic' },                // NetID 0xC0002F
  { prefix: 'FC00C800/22', name: 'Microshare' },           // NetID 0xC00032
  { prefix: 'FC00CC00/22', name: 'HEIG-VD' },              // NetID 0xC00033
  { prefix: 'FC00DC00/22', name: 'Alperia Fiber' },        // NetID 0xC00037
  { prefix: 'FC00E000/22', name: 'First Snow' },           // NetID 0xC00038
  { prefix: 'FC00E400/22', name: 'Acklio' },               // NetID 0xC00039
  { prefix: 'FC00E800/22', name: 'Vutility' },             // NetID 0xC0003A
  { prefix: 'FC00EC00/22', name: 'Meshed' },               // NetID 0xC0003B
  { prefix: 'FC00F000/22', name: 'Birdz' },                // NetID 0xC0003C
  { prefix: 'FC00F400/22', name: 'Arthur D Riley' },       // NetID 0xC0003D
  { prefix: 'FC00F800/22', name: 'Komro' },                // NetID 0xC0003E
  { prefix: 'FC00FC00/22', name: 'RSAWEB' },               // NetID 0xC0003F
  { prefix: 'FC010000/22', name: 'Ceske Radiokomunikace' },// NetID 0xC00040
  { prefix: 'FC010400/22', name: 'CM Systems' },           // NetID 0xC00041
  { prefix: 'FC010800/22', name: 'Melita.io' },            // NetID 0xC00042
  { prefix: 'FC010C00/22', name: 'PROESYS' },              // NetID 0xC00043
  { prefix: 'FC011000/22', name: 'MeWe' },                 // NetID 0xC00044
  { prefix: 'FC011400/22', name: 'Alpha-Omega Technology' }, // NetID 0xC00045
  { prefix: 'FC011800/22', name: 'Mayflower Smart Control' }, // NetID 0xC00046
  { prefix: 'FC011C00/22', name: 'VEGA Grieshaber' },      // NetID 0xC00047
  { prefix: 'FC012000/22', name: 'Afghan Wireless' },      // NetID 0xC00048
  { prefix: 'FC012400/22', name: 'API-K' },                // NetID 0xC00049
  { prefix: 'FC012800/22', name: 'Decstream' },            // NetID 0xC0004A
  { prefix: 'FC012C00/22', name: 'Nova Track' },           // NetID 0xC0004B
  { prefix: 'FC013000/22', name: 'IMT Atlantique' },       // NetID 0xC0004C
  { prefix: 'FC013400/22', name: 'Machines Talk' },        // NetID 0xC0004D
  { prefix: 'FC013800/22', name: 'Yosensi' },              // NetID 0xC0004E
  { prefix: 'FC013C00/22', name: 'The IoT Solutions' },    // NetID 0xC0004F
  { prefix: 'FC014000/22', name: 'Neptune Technology' },   // NetID 0xC00050
  { prefix: 'FC014400/22', name: 'myDevices' },            // NetID 0xC00051
  { prefix: 'FC014800/22', name: 'Savoie Mont Blanc University' }, // NetID 0xC00052
  { prefix: 'FC014C00/22', name: 'Helium' },               // NetID 0xC00053 (Decentralized Wireless Foundation)
  { prefix: 'FC015000/22', name: 'X-Telia' },              // NetID 0xC00054
  { prefix: 'FC015400/22', name: 'Deviceroy' },            // NetID 0xC00055
  { prefix: 'FC015800/22', name: 'Eutelsat' },             // NetID 0xC00056
  { prefix: 'FC015C00/22', name: 'Dingtek' },              // NetID 0xC00057
  { prefix: 'FC016000/22', name: 'The Things Network' },   // NetID 0xC00058
  { prefix: 'FC016400/22', name: 'Quandify' },             // NetID 0xC00059
  { prefix: 'FC016800/22', name: 'Hutchison Drei Austria' }, // NetID 0xC0005A
  { prefix: 'FC016C00/22', name: 'Agrology' },             // NetID 0xC0005B
  { prefix: 'FC017000/22', name: 'mhascaro' },             // NetID 0xC0005C
  { prefix: 'FC017400/22', name: 'Log5 Data' },            // NetID 0xC0005D
  { prefix: 'FC017800/22', name: 'Citysens' },             // NetID 0xC0005E

  // ==========================================
  // Type 7 NetIDs (17-bit NwkID) - /21 prefix
  // ==========================================
  { prefix: 'FE001000/21', name: 'Techtenna' },            // NetID 0xE00020
  { prefix: 'FE001800/21', name: 'LNX Solutions' },        // NetID 0xE00030
  { prefix: 'FE002000/21', name: 'Cometa' },               // NetID 0xE00040
  { prefix: 'FE002800/21', name: 'Senwize' },              // NetID 0xE00050
];

let operatorPrefixes: OperatorPrefix[] = [];

export function initOperatorPrefixes(customOperators: Array<{ prefix: string | string[]; name: string; priority?: number }> = []): void {
  operatorPrefixes = [];

  // Add built-in operators with priority 0
  for (const op of BUILTIN_OPERATORS) {
    const { prefix, mask, bits } = parsePrefix(op.prefix);
    operatorPrefixes.push({ prefix, mask, bits, name: op.name, priority: 0 });
  }

  // Add custom operators with higher priority (default 100)
  for (const op of customOperators) {
    const prefixes = Array.isArray(op.prefix) ? op.prefix : [op.prefix];
    for (const prefixStr of prefixes) {
      const { prefix, mask, bits } = parsePrefix(prefixStr);
      operatorPrefixes.push({ prefix, mask, bits, name: op.name, priority: op.priority ?? 100 });
    }
  }

  // Sort by priority descending (higher priority first), then by bits descending (more specific first)
  operatorPrefixes.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.bits - a.bits;
  });
}

export function getOperatorPrefixes(): OperatorPrefix[] {
  return operatorPrefixes;
}
