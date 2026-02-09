import type { FastifyInstance } from 'fastify';
import {
  getCustomOperators,
  addCustomOperator,
  deleteCustomOperator,
  getHideRules,
  addHideRule,
  deleteHideRule,
} from '../db/queries.js';
import { initOperatorPrefixes } from '../operators/prefixes.js';

export async function operatorRoutes(fastify: FastifyInstance): Promise<void> {
  // List custom operators
  fastify.get('/api/operators', async () => {
    const operators = await getCustomOperators();
    return { operators };
  });

  // Add custom operator
  fastify.post<{
    Body: { prefix: string; name: string; priority?: number };
  }>('/api/operators', async (request, reply) => {
    const { prefix, name, priority } = request.body;

    if (!prefix || !name) {
      reply.code(400);
      return { error: 'prefix and name are required' };
    }

    const id = await addCustomOperator(prefix, name, priority ?? 0);

    // Reload operator prefixes
    const operators = await getCustomOperators();
    initOperatorPrefixes(operators);

    return { id };
  });

  // Delete custom operator
  fastify.delete<{ Params: { id: string } }>('/api/operators/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    await deleteCustomOperator(id);

    // Reload operator prefixes
    const operators = await getCustomOperators();
    initOperatorPrefixes(operators);

    return { success: true };
  });

  // List hide rules
  fastify.get('/api/hide-rules', async () => {
    const rules = await getHideRules();
    return { rules };
  });

  // Add hide rule
  fastify.post<{
    Body: { type: 'dev_addr' | 'join_eui'; prefix: string; description?: string };
  }>('/api/hide-rules', async (request, reply) => {
    const { type, prefix, description } = request.body;

    if (!type || !prefix) {
      reply.code(400);
      return { error: 'type and prefix are required' };
    }

    if (type !== 'dev_addr' && type !== 'join_eui') {
      reply.code(400);
      return { error: 'type must be dev_addr or join_eui' };
    }

    const id = await addHideRule(type, prefix, description);
    return { id };
  });

  // Delete hide rule
  fastify.delete<{ Params: { id: string } }>('/api/hide-rules/:id', async (request) => {
    const id = parseInt(request.params.id, 10);
    await deleteHideRule(id);
    return { success: true };
  });
}
