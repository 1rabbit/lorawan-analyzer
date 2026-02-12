import type { FastifyInstance } from 'fastify';
import {
  getChirpStackServers,
  insertChirpStackServer,
  deleteChirpStackServer,
} from '../db/queries.js';

export async function importServerRoutes(fastify: FastifyInstance): Promise<void> {
  // List all saved ChirpStack servers
  fastify.get('/api/chirpstack-servers', async () => {
    const servers = await getChirpStackServers();
    return { servers };
  });

  // Save a new ChirpStack server (URL only, NEVER store tokens)
  fastify.post<{
    Body: { name: string; url: string };
  }>('/api/chirpstack-servers', async (request, reply) => {
    const { name, url } = request.body;

    if (!name || name.trim().length === 0) {
      reply.code(400);
      return { error: 'name est requis et ne peut pas être vide.' };
    }

    if (!url || url.trim().length === 0) {
      reply.code(400);
      return { error: 'url est requis et ne peut pas être vide.' };
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      reply.code(400);
      return { error: "url doit commencer par http:// ou https://." };
    }

    const id = crypto.randomUUID();
    await insertChirpStackServer({
      id,
      name: name.trim(),
      url: url.trim().replace(/\/+$/, ''),
    });

    const servers = await getChirpStackServers();
    const created = servers.find(s => s.id === id);
    return created;
  });

  // Delete a saved ChirpStack server
  fastify.delete<{
    Params: { id: string };
  }>('/api/chirpstack-servers/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      await deleteChirpStackServer(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        reply.code(404);
        return { error: `Serveur ChirpStack ${id} introuvable.` };
      }
      throw err;
    }

    return { success: true };
  });
}
