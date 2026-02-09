import type { FastifyInstance } from 'fastify';
import { getMetadataCache } from './index.js';
import {
  getDeviceActivity,
  getJoinRequests,
  getDeviceProfile,
  getDeviceFCntTimeline,
  getDevicePacketIntervals,
  getDeviceSignalTrends,
  getDeviceDistributions,
  getDevicePacketLoss,
  getJoinRequestsByJoinEui,
  getJoinEuiTimeline,
} from '../db/queries.js';

export async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  // Get device activity
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string; gateway_id?: string };
  }>('/api/devices/:devaddr', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const gatewayId = request.query.gateway_id || null;
    const activity = await getDeviceActivity(request.params.devaddr.toUpperCase(), hours, gatewayId);
    return { activity };
  });

  // Get join requests
  fastify.get<{
    Querystring: { gateway_id?: string; hours?: string; limit?: string };
  }>('/api/joins', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const limit = parseInt(request.query.limit ?? '100', 10);
    const gatewayId = request.query.gateway_id || null;
    const joins = await getJoinRequests(gatewayId, hours, limit);
    return { joins };
  });

  // Get device profile summary
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string; gateway_id?: string };
  }>('/api/devices/:devaddr/profile', async (request, reply) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const gatewayId = request.query.gateway_id || null;
    const profile = await getDeviceProfile(request.params.devaddr.toUpperCase(), hours, gatewayId);
    if (!profile) {
      reply.code(404);
      return { error: 'Device not found' };
    }
    // Enrich with device metadata from cache
    const metadata = getMetadataCache()?.getByDevAddr(request.params.devaddr.toUpperCase());
    if (metadata) {
      profile.device_name = metadata.device_name;
      profile.dev_eui = metadata.dev_eui;
      profile.application_name = metadata.application_name;
      profile.device_profile_name = metadata.device_profile_name;
    }
    return { profile, last_payload: metadata?.last_payload ?? null };
  });

  // Get device FCnt timeline
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string };
  }>('/api/devices/:devaddr/fcnt-timeline', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const timeline = await getDeviceFCntTimeline(request.params.devaddr.toUpperCase(), hours);
    return { timeline };
  });

  // Get device packet intervals histogram
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string };
  }>('/api/devices/:devaddr/intervals', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const intervals = await getDevicePacketIntervals(request.params.devaddr.toUpperCase(), hours);
    return { intervals };
  });

  // Get device signal trends (RSSI/SNR over time)
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string; interval?: string; gateway_id?: string };
  }>('/api/devices/:devaddr/signal-trends', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const interval = request.query.interval ?? '1h';
    const gatewayId = request.query.gateway_id || null;
    const trends = await getDeviceSignalTrends(request.params.devaddr.toUpperCase(), hours, interval, gatewayId);
    return { trends };
  });

  // Get device distributions (SF and frequency breakdown)
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string; gateway_id?: string };
  }>('/api/devices/:devaddr/distributions', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const gatewayId = request.query.gateway_id || null;
    const distributions = await getDeviceDistributions(request.params.devaddr.toUpperCase(), hours, gatewayId);
    return { distributions };
  });

  // Get device packet loss stats
  fastify.get<{
    Params: { devaddr: string };
    Querystring: { hours?: string; gateway_id?: string };
  }>('/api/devices/:devaddr/packet-loss', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const gatewayId = request.query.gateway_id || null;
    const loss = await getDevicePacketLoss(request.params.devaddr.toUpperCase(), hours, gatewayId);
    return { loss };
  });

  // Get join requests grouped by JoinEUI
  fastify.get<{
    Querystring: { gateway_id?: string; hours?: string };
  }>('/api/joins/by-eui', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const gatewayId = request.query.gateway_id || null;
    const groups = await getJoinRequestsByJoinEui(gatewayId, hours);
    return { groups };
  });

  // Get timeline for specific JoinEUI
  fastify.get<{
    Params: { joinEui: string };
    Querystring: { hours?: string };
  }>('/api/joins/eui/:joinEui/timeline', async (request) => {
    const hours = parseInt(request.query.hours ?? '24', 10);
    const timeline = await getJoinEuiTimeline(request.params.joinEui.toUpperCase(), hours);
    return { timeline };
  });
}
