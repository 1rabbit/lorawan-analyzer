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

  // ==========================================
  // Helium OUI Prefixes
  // ==========================================
  { prefix: '48000000/22', name: 'Foundation Console' },                // OUI 1
  { prefix: '48000400/22', name: 'Nova Dev Console'},                   // OUI 2
  { prefix: '48000800/29', name: 'Helium Foundation Staging Console' }, // OUI 3
  { prefix: '48000808/29', name: 'Nova Staging Console' },              // OUI 4
  { prefix: '48000810/29', name: 'Helium OUI 5' },                      // OUI 5
  { prefix: '48000950/28', name: 'HeyIoT.xyz' },                        // OUI 6
  { prefix: '48000960/27', name: 'HeyIoT.xyz' },                        // OUI 6
  { prefix: '48000980/26', name: 'HeyIoT.xyz' },                        // OUI 6
  { prefix: '48000948/29', name: 'HeyIoT.xyz' },                        // OUI 6
  { prefix: '48000818/29', name: 'HeyIoT.xyz' },                        // OUI 6
  { prefix: '48000820/29', name: 'Helium OUI 7' },                      // OUI 7
  { prefix: '48000828/29', name: 'Helium OUI 8' },                      // OUI 8
  { prefix: '48000830/29', name: 'Nova Roaming US' },                   // OUI 9
  { prefix: '48000838/29', name: 'Helium OUI 10' },                     // OUI 10
  { prefix: '48000840/29', name: 'Helium OUI 11' },                     // OUI 11
  { prefix: '48000860/27', name: 'LoneStar Tracking' },                 // OUI 12
  { prefix: '480009E0/27', name: 'LoneStar Tracking' },                 // OUI 12
  { prefix: '48000A00/26', name: 'LoneStar Tracking' },                 // OUI 12
  { prefix: '48000A40/27', name: 'LoneStar Tracking' },                 // OUI 12
  { prefix: '48000848/29', name: 'Helium OUI 13' },                     // OUI 13
  { prefix: '48000850/29', name: 'Helium OUI 14' },                     // OUI 14
  { prefix: '48000858/29', name: 'Helium OUI 15' },                     // OUI 15
  { prefix: '48000880/29', name: 'Nova Roaming EU' },                   // OUI 16
  { prefix: '48000888/29', name: 'Helium OUI 17' },                     // OUI 17
  { prefix: '48000890/28', name: 'Helium OUI 18' },                     // OUI 18
  { prefix: '480008A0/29', name: 'Helium OUI 19' },                     // OUI 19
  { prefix: '480008A8/29', name: 'Helium OUI 20' },                     // OUI 20
  { prefix: '480008B0/29', name: 'Helium OUI 21' },                     // OUI 21
  { prefix: '480008B8/29', name: 'Helium OUI 22' },                     // OUI 22
  { prefix: '480008C0/29', name: 'Helium OUI 23' },                     // OUI 23
  { prefix: '480008C8/29', name: 'Helium OUI 24' },                     // OUI 24
  { prefix: '480008D0/29', name: 'Helium OUI 25' },                     // OUI 25
  { prefix: '480008D8/29', name: 'Helium OUI 26' },                     // OUI 26
  { prefix: '480008E0/29', name: 'Helium OUI 27' },                     // OUI 27
  { prefix: '480008E8/29', name: 'Helium OUI 28' },                     // OUI 28
  { prefix: '480008F0/29', name: 'Helium OUI 29' },                     // OUI 29
  { prefix: '480008F8/29', name: 'Helium OUI 30' },                     // OUI 30
  { prefix: '48000900/29', name: 'Helium OUI 31' },                     // OUI 31
  { prefix: '48000908/29', name: 'Helium OUI 32' },                     // OUI 32
  { prefix: '48000910/29', name: 'Helium OUI 33' },                     // OUI 33
  { prefix: '48000918/29', name: 'Helium OUI 34' },                     // OUI 34
  { prefix: '48000920/29', name: 'Helium OUI 35' },                     // OUI 35
  { prefix: '48000928/29', name: 'Helium OUI 36' },                     // OUI 36
  { prefix: '48000930/29', name: 'Helium OUI 37' },                     // OUI 37
  { prefix: '48000938/29', name: 'Helium OUI 38' },                     // OUI 38
  { prefix: '48000940/29', name: 'Helium OUI 39' },                     // OUI 39
  { prefix: '48000948/29', name: 'Helium OUI 40' },                     // OUI 40
  { prefix: '48000950/29', name: 'Helium OUI 41' },                     // OUI 41
  { prefix: '48000958/29', name: 'Helium OUI 42' },                     // OUI 42
  { prefix: '48000960/29', name: 'Helium OUI 43' },                     // OUI 43
  { prefix: '48000968/29', name: 'Helium OUI 44' },                     // OUI 44
  { prefix: '48000970/29', name: 'Helium OUI 45' },                     // OUI 45
  { prefix: '48000978/29', name: 'Helium OUI 46' },                     // OUI 46
  { prefix: '48000980/29', name: 'Helium OUI 47' },                     // OUI 47
  { prefix: '48000988/29', name: 'Helium OUI 48' },                     // OUI 48
  { prefix: '48000990/29', name: 'Helium OUI 49' },                     // OUI 49
  { prefix: '48000998/29', name: 'Helium OUI 50' },                     // OUI 50
  { prefix: '480009A0/29', name: 'Helium OUI 51' },                     // OUI 51
  { prefix: '480009A8/29', name: 'Helium OUI 52' },                     // OUI 52
  { prefix: 'FC014C10/29', name: 'Helium OUI 60' },                     // OUI 60
  { prefix: 'FC014C18/29', name: 'Helium OUI 61' },                     // OUI 61
  { prefix: 'FC014C28/29', name: 'Helium OUI 62' },                     // OUI 62
  { prefix: '16000000/7', name: 'Helium OUI 63' },                      // OUI 63
  { prefix: '72000000/7', name: 'Helium OUI 64' },                      // OUI 64
  { prefix: 'E0260000/15', name: 'Helium OUI 65' },                     // OUI 65
  { prefix: '480009C0/29', name: 'Helium OUI 96' },                     // OUI 96
  { prefix: '480009C8/29', name: 'Helium OUI 97' },                     // OUI 97
  { prefix: '480009D0/29', name: 'Helium OUI 98' },                     // OUI 98
  { prefix: '480009D8/29', name: 'Helium OUI 129' },                    // OUI 129
  { prefix: '30000000/7', name: 'Helium OUI 162' },                     // OUI 162
  { prefix: '78000000/29', name: 'Meteo Scientific' },                  // OUI 197
  { prefix: '78000008/29', name: 'Helium OUI 228' },                    // OUI 228
  { prefix: '78000010/29', name: 'Helium OUI 261' },                    // OUI 261
  { prefix: '78000018/29', name: 'Helium OUI 294' },                    // OUI 294
  { prefix: '78000020/29', name: 'WDRIoT'},                             // OUI 327
  { prefix: '780001C8/29', name: 'WDRIoT'},                             // OUI 327
  { prefix: '780001D0/28', name: 'WDRIoT'},                             // OUI 327
  { prefix: '780001E0/28', name: 'WDRIoT'},                             // OUI 327
  { prefix: '78000028/29', name: 'Heium OUI 360' },                     // OUI 360
  { prefix: '78000030/29', name: 'Yosensi' },                           // OUI 393
  { prefix: '78000038/29', name: 'Heium OUI 426' },                     // OUI 426
  { prefix: 'FE005800/25', name: 'Helium OUI 459' },                    // OUI 459
  { prefix: '78000040/29', name: 'LoneStar Tracking' },                 // OUI 492
  { prefix: '78000048/29', name: 'Heium OUI 525' },                     // OUI 525
  { prefix: '78000050/29', name: 'Heium OUI 558' },                     // OUI 558
  { prefix: '78000058/29', name: 'Heium OUI 591' },                     // OUI 591
  { prefix: 'FE008800/25', name: 'Helium OUI 624' },                    // OUI 624
  { prefix: '78000060/29', name: 'Heium OUI 657' },                     // OUI 657
  { prefix: 'FE001000/25', name: 'Helium OUI 658' },                    // OUI 658
  { prefix: 'FE001080/25', name: 'Helium OUI 690' },                    // OUI 690
  { prefix: 'E0040000/15', name: 'Helium OUI 691' },                    // OUI 691
  { prefix: '78000068/29', name: 'Heium OUI 756' },                     // OUI 756
  { prefix: 'FE008880/25', name: 'Helium OUI 789' },                    // OUI 789
  { prefix: '78000070/29', name: 'Heium OUI 822' },                     // OUI 822
  { prefix: '78000078/29', name: 'IoT-Wireless' },                      // OUI 823
  { prefix: '78000080/29', name: 'Heium OUI 824' },                     // OUI 824
  { prefix: 'FC01A400/22', name: 'Helium OUI 855' },                    // OUI 855
  { prefix: '78000088/29', name: 'Nebra Ltd' },                         // OUI 921
  { prefix: '78000090/29', name: 'Heium OUI 954' },                     // OUI 954
  { prefix: 'FE004800/25', name: 'SkyNet IoT' },                        // OUI 987
  { prefix: '78000098/29', name: 'Helium OUI 1020' },                   // OUI 1020
  { prefix: '780000E0/29', name: 'Helium OUI 1020' },                   // OUI 1020
  { prefix: '78000258/29', name: 'Helium OUI 1020' },                   // OUI 1020
  { prefix: '78000260/27', name: 'Helium OUI 1020' },                   // OUI 1020
  { prefix: '78000280/26', name: 'Helium OUI 1020' },                   // OUI 1020
  { prefix: 'E04A0000/15', name: 'Helium OUI 1053' },                   // OUI 1053
  { prefix: '12000000/7', name: 'Helium OUI 1086' },                    // OUI 1086
  { prefix: 'FE00A000/25', name: 'Trackpac Ltd' },                      // OUI 1119
  { prefix: '780000A0/29', name: 'Helium OUI 1152' },                   // OUI 1152
  { prefix: '780000A8/29', name: 'Helium OUI 1153' },                   // OUI 1153
  { prefix: '780000B0/29', name: 'Sattrack.co.uk' },                    // OUI 1185
  { prefix: '780000B8/29', name: 'Helium OUI 1218' },                   // OUI 1218
  { prefix: '780000C0/29', name: 'Helium OUI 1251' },                   // OUI 1251
  { prefix: '780000C8/29', name: 'Helium OUI 1284' },                   // OUI 1284
  { prefix: '780000D0/29', name: 'Helium OUI 1317' },                   // OUI 1317
  { prefix: '780000D8/29', name: 'Helium OUI 1350' },                   // OUI 1350
  { prefix: 'FE003000/25', name: 'Helium OUI 1383' },                   // OUI 1383
  { prefix: 'FC006800/22', name: 'Helium OUI 1416' },                   // OUI 1416
  { prefix: 'FC014C00/29', name: 'Helium OUI 1449' },                   // OUI 1449
  { prefix: '780000E8/29', name: 'Helium OUI 1482' },                   // OUI 1482
  { prefix: 'FC00EC00/22', name: 'Helium OUI 1515' },                   // OUI 1515
  { prefix: '780000F0/29', name: 'Helium OUI 1548' },                   // OUI 1548
  { prefix: '780000F8/29', name: 'Helium OUI 1581' },                   // OUI 1581
  { prefix: 'FC01D400/22', name: 'Helium OUI 1614' },                   // OUI 1614
  { prefix: '78000100/29', name: 'Helium OUI 1647' },                   // OUI 1647
  { prefix: '78000108/29', name: 'Helium OUI 1680' },                   // OUI 1680
  { prefix: '78000110/29', name: 'Helium OUI 1714' },                   // OUI 1714
  { prefix: 'FC01AC00/22', name: 'Helium OUI 1746' },                   // OUI 1746
  { prefix: '78000118/29', name: 'Helium OUI 1779' },                   // OUI 1779
  { prefix: '78000120/29', name: 'Helium OUI 1780' },                   // OUI 1780
  { prefix: 'E0680000/15', name: 'Helium OUI 1812' },                   // OUI 1812
  { prefix: '78000128/29', name: 'Helium OUI 1845' },                   // OUI 1845
  { prefix: '78000130/29', name: 'Helium OUI 1845' },                   // OUI 1845
  { prefix: '78000138/29', name: 'Helium OUI 1878' },                   // OUI 1878
  { prefix: '78000140/26', name: 'Helium OUI 1911' },                   // OUI 1911
  { prefix: '78000180/29', name: 'Helium OUI 1944' },                   // OUI 1944
  { prefix: '78000188/29', name: 'Helium OUI 1977' },                   // OUI 1977
  { prefix: 'FE00B800/25', name: 'Helium OUI 2010' },                   // OUI 2010
  { prefix: '08000000/7', name: 'Helium OUI 2076' },                    // OUI 2076
  { prefix: '78000190/29', name: 'BUOY.fish' },                         // OUI 2109
  { prefix: '78000198/29', name: 'Helium OUI 2142' },                   // OUI 2142
  { prefix: '780001A0/29', name: 'Helium OUI 2175' },                   // OUI 2175
  { prefix: '780001A8/29', name: 'Helium OUI 2208' },                   // OUI 2208
  { prefix: '780001B0/29', name: 'Helium OUI 2241' },                   // OUI 2241
  { prefix: '780001B8/29', name: 'Ozone Space' },                       // OUI 2274
  { prefix: '780001C0/29', name: 'Helium OUI 2307' },                   // OUI 2307
  { prefix: 'FC000800/22', name: 'Helium OUI 2340' },                   // OUI 2340
  { prefix: '780001F0/29', name: 'Helium OUI 2373' },                   // OUI 2373
  { prefix: '780001F8/29', name: 'Helium OUI 2374' },                   // OUI 2374
  { prefix: '78000200/29', name: 'Helium OUI 2406' },                   // OUI 2406
  { prefix: '78000208/29', name: 'Helium OUI 2439' },                   // OUI 2439
  { prefix: '78000210/29', name: 'Helium OUI 2440' },                   // OUI 2440
  { prefix: '78000218/29', name: 'Helium OUI 2472' },                   // OUI 2472
  { prefix: '78000220/29', name: 'Helium OUI 2505' },                   // OUI 2505
  { prefix: '78000228/29', name: 'Helium OUI 2506' },                   // OUI 2506
  { prefix: '78000230/29', name: 'Helium OUI 2538' },                   // OUI 2538
  { prefix: '78000238/29', name: 'Helium OUI 2571' },                   // OUI 2571
  { prefix: '78000240/29', name: 'Helium OUI 2604' },                   // OUI 2604
  { prefix: '78000248/29', name: 'Helium OUI 2637' },                   // OUI 2637
  { prefix: '0E000000/7', name: 'Helium OUI 2670' },                    // OUI 2670
  { prefix: '78000250/29', name: 'Helium OUI 2703' },                   // OUI 2703
  { prefix: '78000348/29', name: 'Helium OUI 2703' },                   // OUI 2703
  { prefix: '780002C0/29', name: 'helium.dataMatters.io' },             // OUI 2736
  { prefix: '78000388/29', name: 'Helium OUI 2736' },                   // OUI 2736 
  { prefix: '78000390/29', name: 'Helium OUI 2736' },                   // OUI 2736 
  { prefix: 'FC01E000/22', name: 'Helium OUI 2769' },                   // OUI 2769
  { prefix: '780002C8/29', name: 'Helium OUI 2802' },                   // OUI 2802
  { prefix: '780002D0/29', name: 'Helium OUI 2835' },                   // OUI 2835
  { prefix: '780002D8/29', name: 'Helium OUI 2868' },                   // OUI 2868
  { prefix: '780002E0/29', name: 'Helium OUI 2901' },                   // OUI 2901
  { prefix: '780002E8/29', name: 'Helium OUI 2934' },                   // OUI 2934
  { prefix: '780002F0/29', name: 'Helium OUI 2967' },                   // OUI 2967
  { prefix: '780002F8/29', name: 'Helium OUI 3000' },                   // OUI 3000 
  { prefix: '78000300/27', name: 'Helium OUI 3000' },                   // OUI 3000 
  { prefix: '78000320/29', name: 'Helium OUI 3033' },                   // OUI 3033
  { prefix: '04000000/7', name: 'Helium OUI 3066' },                    // OUI 3066
  { prefix: '78000328/29', name: 'Helium OUI 3099' },                   // OUI 3099
  { prefix: '78000378/29', name: 'Helium OUI 3099' },                   // OUI 3099
  { prefix: '78000330/29', name: 'Helium OUI 3100' },                   // OUI 3100
  { prefix: '78000338/29', name: 'Helium OUI 3132' },                   // OUI 3132
  { prefix: '78000340/29', name: 'Helium OUI 3132' },                   // OUI 3132
  { prefix: '78000350/29', name: 'Helium OUI 3165' },                   // OUI 3165
  { prefix: '78000358/29', name: 'Helium OUI 3198' },                   // OUI 3198
  { prefix: '78000360/29', name: 'Helium OUI 3231' },                   // OUI 3231
  { prefix: '78000368/29', name: 'Helium OUI 3232' },                   // OUI 3232
  { prefix: '78000370/29', name: 'Helium OUI 3233' },                   // OUI 3233
  { prefix: 'FC01FC00/22', name: 'Helium OUI 3264' },                   // OUI 3264
  { prefix: '78000380/29', name: 'Helium OUI 3297' },                   // OUI 3297
  { prefix: '78000398/29', name: 'Helium OUI 3330' },                   // OUI 3330
  { prefix: '780003A0/29', name: 'Helium OUI 3363' },                   // OUI 3363
  { prefix: '780003A8/29', name: 'Helium OUI 3396' },                   // OUI 3396
  { prefix: '780003B0/29', name: 'SmartFlows' },                        // OUI 3429
  { prefix: '780003B8/29', name: 'Helium OUI 3462' },                   // OUI 3462
  { prefix: '780003C0/29', name: 'Helium OUI 3495' },                   // OUI 3495
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
