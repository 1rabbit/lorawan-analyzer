import type { FastifyInstance } from 'fastify';
import {
  getImportProfiles,
  getImportProfileById,
  insertImportProfile,
  updateImportProfile,
  deleteImportProfile,
} from '../db/queries.js';

export async function importProfileRoutes(fastify: FastifyInstance): Promise<void> {
  // List all import profiles
  fastify.get('/api/import-profiles', async () => {
    const profiles = await getImportProfiles();
    return { profiles };
  });

  // Create a new import profile
  fastify.post<{
    Body: { name: string; requiredTags?: string[] };
  }>('/api/import-profiles', async (request, reply) => {
    const { name, requiredTags } = request.body;

    if (!name || name.trim().length === 0) {
      reply.code(400);
      return { error: 'name est requis et ne peut pas être vide.' };
    }

    if (requiredTags !== undefined && !Array.isArray(requiredTags)) {
      reply.code(400);
      return { error: 'requiredTags doit être un tableau de chaînes.' };
    }

    const id = crypto.randomUUID();
    await insertImportProfile({
      id,
      name: name.trim(),
      required_tags: requiredTags ?? [],
    });

    const profile = await getImportProfileById(id);
    return profile;
  });

  // Update an import profile
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; requiredTags?: string[] };
  }>('/api/import-profiles/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, requiredTags } = request.body;

    if (name !== undefined && name.trim().length === 0) {
      reply.code(400);
      return { error: 'name ne peut pas être vide.' };
    }

    if (requiredTags !== undefined && !Array.isArray(requiredTags)) {
      reply.code(400);
      return { error: 'requiredTags doit être un tableau de chaînes.' };
    }

    try {
      await updateImportProfile(id, {
        name: name?.trim(),
        required_tags: requiredTags,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        reply.code(404);
        return { error: `Profil d'import ${id} introuvable.` };
      }
      throw err;
    }

    const profile = await getImportProfileById(id);
    return profile;
  });

  // Delete an import profile
  fastify.delete<{
    Params: { id: string };
  }>('/api/import-profiles/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      await deleteImportProfile(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) {
        reply.code(404);
        return { error: `Profil d'import ${id} introuvable.` };
      }
      throw err;
    }

    return { success: true };
  });
}
