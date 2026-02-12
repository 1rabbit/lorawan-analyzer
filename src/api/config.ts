import type { FastifyInstance } from 'fastify';
import type { MyDeviceRange, OperatorMapping } from '../types.js';
import { getOperatorColorMap } from '../operators/prefixes.js';
import { getDevicePrefixColorMap } from '../operators/matcher.js';

let myDeviceRanges: MyDeviceRange[] = [];
let operatorColorMap: Record<string, string> = {};

export function setMyDeviceRanges(ranges: MyDeviceRange[]): void {
  myDeviceRanges = ranges;
}

export function setOperatorColors(operators: OperatorMapping[]): void {
  // Only use netid operator colors (not device prefix/manufacturer colors)
  operatorColorMap = getOperatorColorMap();
  // Config.toml custom colors override built-in ones (highest priority)
  for (const op of operators) {
    if (op.color) {
      operatorColorMap[op.name] = op.color;
    }
  }
}

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/config/my-devices', async () => {
    return { ranges: myDeviceRanges };
  });

  fastify.get('/api/config/operator-colors', async () => {
    return operatorColorMap;
  });
}
