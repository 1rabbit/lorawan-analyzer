import type { FastifyInstance } from 'fastify';
import type { MqttConfig, ChirpStackApiConfig } from '../types.js';
import { getSetting, setSetting, getAllSettings } from '../db/queries.js';
import { getMqttStatus } from '../mqtt/consumer.js';

export interface SettingsCallbacks {
  onMqttChanged: (config: MqttConfig) => Promise<void>;
  onChirpStackApiChanged: (config: ChirpStackApiConfig | null) => Promise<void>;
}

export function settingsRoutes(callbacks: SettingsCallbacks) {
  return async function (fastify: FastifyInstance): Promise<void> {
    // GET /api/settings - Returns current settings
    fastify.get('/api/settings', async () => {
      const settings = await getAllSettings();

      let mqtt: Partial<MqttConfig> | null = null;
      if (settings.mqtt) {
        try {
          mqtt = JSON.parse(settings.mqtt);
        } catch { /* ignore */ }
      }

      let chirpstack_api: ChirpStackApiConfig | null = null;
      if (settings.chirpstack_api) {
        try {
          chirpstack_api = JSON.parse(settings.chirpstack_api);
        } catch { /* ignore */ }
      }

      return {
        mqtt,
        chirpstack_api,
        mqtt_status: getMqttStatus(),
      };
    });

    // GET /api/settings/status - MQTT connection status
    fastify.get('/api/settings/status', async () => {
      return getMqttStatus();
    });

    // PUT /api/settings/mqtt - Save MQTT settings and reconnect
    fastify.put<{
      Body: {
        server: string;
        username?: string;
        password?: string;
        topic?: string;
        format?: 'protobuf' | 'json';
        application_topic?: string;
      };
    }>('/api/settings/mqtt', async (request, reply) => {
      const body = request.body;

      if (!body.server) {
        reply.code(400);
        return { error: 'server is required' };
      }

      const mqttConfig: MqttConfig = {
        server: body.server,
        username: body.username ?? '',
        password: body.password ?? '',
        topic: body.topic || 'eu868/gateway/+/event/up',
        format: body.format || 'protobuf',
        application_topic: body.application_topic,
      };

      await setSetting('mqtt', JSON.stringify(mqttConfig));

      try {
        await callbacks.onMqttChanged(mqttConfig);
      } catch (err) {
        console.error('Error reconnecting MQTT:', err);
        reply.code(500);
        return { error: 'Settings saved but MQTT reconnection failed' };
      }

      return { success: true };
    });

    // PUT /api/settings/chirpstack-api - Save ChirpStack API settings
    fastify.put<{
      Body: {
        url: string;
        api_key: string;
      };
    }>('/api/settings/chirpstack-api', async (request, reply) => {
      const body = request.body;

      if (!body.url || !body.api_key) {
        reply.code(400);
        return { error: 'url and api_key are required' };
      }

      const config: ChirpStackApiConfig = {
        url: body.url,
        api_key: body.api_key,
      };

      await setSetting('chirpstack_api', JSON.stringify(config));

      try {
        await callbacks.onChirpStackApiChanged(config);
      } catch (err) {
        console.error('Error restarting ChirpStack sync:', err);
        reply.code(500);
        return { error: 'Settings saved but sync restart failed' };
      }

      return { success: true };
    });

    // DELETE /api/settings/chirpstack-api - Remove ChirpStack API config
    fastify.delete('/api/settings/chirpstack-api', async () => {
      await setSetting('chirpstack_api', '');

      try {
        await callbacks.onChirpStackApiChanged(null);
      } catch (err) {
        console.error('Error stopping ChirpStack sync:', err);
      }

      return { success: true };
    });
  };
}
