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
  fastify.get('/api/operators', () => {
    const operators = getCustomOperators();
    return { operators };
  });

  // Add custom operator
  fastify.post<{
    Body: { prefix: string; name: string; priority?: number };
  }>('/api/operators', (request, reply) => {
    const { prefix, name, priority } = request.body;

    if (!prefix || !name) {
      reply.code(400);
      return { error: 'prefix and name are required' };
    }

    const id = addCustomOperator(prefix, name, priority ?? 0);

    // Reload operator prefixes
    initOperatorPrefixes(getCustomOperators());

    return { id };
  });

  // Delete custom operator
  fastify.delete<{ Params: { id: string } }>('/api/operators/:id', (request) => {
    const id = parseInt(request.params.id, 10);
    deleteCustomOperator(id);

    // Reload operator prefixes
    initOperatorPrefixes(getCustomOperators());

    return { success: true };
  });

  // List hide rules
  fastify.get('/api/hide-rules', () => {
    const rules = getHideRules();
    return { rules };
  });

  // Add hide rule
  fastify.post<{
    Body: { type: 'dev_addr' | 'join_eui'; prefix: string; description?: string };
  }>('/api/hide-rules', (request, reply) => {
    const { type, prefix, description } = request.body;

    if (!type || !prefix) {
      reply.code(400);
      return { error: 'type and prefix are required' };
    }

    if (type !== 'dev_addr' && type !== 'join_eui') {
      reply.code(400);
      return { error: 'type must be dev_addr or join_eui' };
    }

    const id = addHideRule(type, prefix, description);
    return { id };
  });

  // Delete hide rule
  fastify.delete<{ Params: { id: string } }>('/api/hide-rules/:id', (request) => {
    const id = parseInt(request.params.id, 10);
    deleteHideRule(id);
    return { success: true };
  });
}
