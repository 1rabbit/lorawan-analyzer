import type { FastifyInstance } from 'fastify';
import type { MyDeviceRange, OperatorMapping } from '../types.js';

let myDeviceRanges: MyDeviceRange[] = [];
let operatorColorMap: Record<string, string> = {};

export function setMyDeviceRanges(ranges: MyDeviceRange[]): void {
  myDeviceRanges = ranges;
}

export function setOperatorColors(operators: OperatorMapping[]): void {
  operatorColorMap = {};
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
