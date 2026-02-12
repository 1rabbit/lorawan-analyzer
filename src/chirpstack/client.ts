import type { ChirpStackError } from '../types.js';

const REQUEST_TIMEOUT_MS = 30_000;

export class ChirpStackClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  // ============================================
  // Private request helper
  // ============================================

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Grpc-Metadata-Authorization': `Bearer ${this.token}`,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await this.buildError(response, url);
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json() as T;
    } catch (error: unknown) {
      if (error instanceof ChirpStackApiError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ChirpStackApiError({
          status: 0,
          code: 'TIMEOUT',
          message: `Timeout : pas de réponse de ${this.baseUrl} après 30s.`,
        });
      }

      // Network errors (ECONNREFUSED, DNS, etc.)
      const msg = error instanceof Error ? error.message : String(error);
      throw new ChirpStackApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: `Serveur ChirpStack indisponible à ${this.baseUrl}. Vérifiez l'URL et la connectivité.`,
        detail: msg,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async buildError(response: Response, url: string): Promise<ChirpStackApiError> {
    let detail: string | undefined;
    let grpcMessage: string | undefined;

    try {
      const text = await response.text();
      detail = text;
      // Try to extract gRPC message from JSON body
      const json = JSON.parse(text);
      if (json.message) {
        grpcMessage = json.message;
      }
    } catch {
      // Body not readable or not JSON
    }

    switch (response.status) {
      case 401:
        return new ChirpStackApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: grpcMessage ?? 'Authentification échouée : token invalide ou expiré. Vérifiez votre API token.',
          detail,
        });
      case 403:
        return new ChirpStackApiError({
          status: 403,
          code: 'FORBIDDEN',
          message: grpcMessage ?? 'Accès refusé : permissions insuffisantes. Ce token n\'a pas accès à cette ressource.',
          detail,
        });
      case 404:
        return new ChirpStackApiError({
          status: 404,
          code: 'NOT_FOUND',
          message: grpcMessage ?? `Ressource introuvable : ${url}`,
          detail,
        });
      case 409:
        return new ChirpStackApiError({
          status: 409,
          code: 'CONFLICT',
          message: grpcMessage ?? 'Conflit : la ressource existe déjà.',
          detail,
        });
      case 429:
        return new ChirpStackApiError({
          status: 429,
          code: 'RATE_LIMITED',
          message: 'Trop de requêtes. Réessayez dans quelques secondes.',
          detail,
        });
      case 502:
      case 503:
        return new ChirpStackApiError({
          status: response.status,
          code: 'UNAVAILABLE',
          message: `Serveur ChirpStack indisponible à ${this.baseUrl}. Vérifiez l'URL et la connectivité.`,
          detail,
        });
      default:
        return new ChirpStackApiError({
          status: response.status,
          code: 'CHIRPSTACK_ERROR',
          message: grpcMessage ?? `Erreur ChirpStack (HTTP ${response.status})`,
          detail,
        });
    }
  }

  // ============================================
  // Tenants
  // ============================================

  async listTenants(limit = 100, offset = 0): Promise<{ totalCount: number; result: Array<{
    id: string; name: string; canHaveGateways: boolean;
  }> }> {
    return this.request('GET', `/api/tenants?limit=${limit}&offset=${offset}`);
  }

  // ============================================
  // Applications
  // ============================================

  async listApplications(tenantId: string, limit = 100, offset = 0): Promise<{ totalCount: number; result: Array<{
    id: string; name: string; description: string;
  }> }> {
    return this.request('GET', `/api/applications?tenantId=${tenantId}&limit=${limit}&offset=${offset}`);
  }

  // ============================================
  // Device Profiles
  // ============================================

  async listDeviceProfiles(tenantId: string, limit = 100, offset = 0): Promise<{ totalCount: number; result: Array<{
    id: string; name: string; region: string; macVersion: string;
  }> }> {
    return this.request('GET', `/api/device-profiles?tenantId=${tenantId}&limit=${limit}&offset=${offset}`);
  }

  // ============================================
  // Devices
  // ============================================

  async listDevices(applicationId: string, limit = 100, offset = 0): Promise<{ totalCount: number; result: Array<{
    devEui: string; name: string; description: string;
    deviceProfileId: string; deviceProfileName: string;
    isDisabled: boolean; lastSeenAt: string | null;
    tags: Record<string, string>;
  }> }> {
    return this.request('GET', `/api/devices?applicationId=${applicationId}&limit=${limit}&offset=${offset}`);
  }

  async getDevice(devEui: string): Promise<{ device: {
    devEui: string; name: string; description: string;
    applicationId: string; deviceProfileId: string;
    isDisabled: boolean; tags: Record<string, string>;
  } }> {
    return this.request('GET', `/api/devices/${devEui}`);
  }

  async createDevice(device: {
    applicationId: string; deviceProfileId: string;
    name: string; devEui: string; description?: string;
    isDisabled?: boolean; tags?: Record<string, string>;
  }): Promise<void> {
    await this.request('POST', '/api/devices', { device });
  }

  async updateDevice(devEui: string, device: {
    applicationId: string; deviceProfileId: string;
    name: string; devEui: string; description?: string;
    isDisabled?: boolean; tags?: Record<string, string>;
  }): Promise<void> {
    await this.request('PUT', `/api/devices/${devEui}`, { device });
  }

  async deleteDevice(devEui: string): Promise<void> {
    await this.request('DELETE', `/api/devices/${devEui}`);
  }

  // ============================================
  // Device Keys
  // ============================================

  async getDeviceKeys(devEui: string): Promise<{ deviceKeys: {
    devEui: string; nwkKey: string; appKey: string;
  } }> {
    return this.request('GET', `/api/devices/${devEui}/keys`);
  }

  async createDeviceKeys(devEui: string, appKey: string): Promise<void> {
    // Send key as nwkKey (LoRaWAN 1.0.x) and appKey (LoRaWAN 1.1.x)
    await this.request('POST', `/api/devices/${devEui}/keys`, {
      deviceKeys: { devEui, nwkKey: appKey, appKey },
    });
  }

  // ============================================
  // Gateways
  // ============================================

  async listGateways(tenantId?: string, limit = 100, offset = 0): Promise<{ totalCount: number; result: Array<{
    gatewayId: string; name: string; description: string;
    lastSeenAt: string | null;
  }> }> {
    const tenantFilter = tenantId ? `&tenantId=${tenantId}` : '';
    return this.request('GET', `/api/gateways?limit=${limit}&offset=${offset}${tenantFilter}`);
  }
}

// ============================================
// Error class
// ============================================

export class ChirpStackApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly detail?: string;

  constructor(error: ChirpStackError) {
    super(error.message);
    this.name = 'ChirpStackApiError';
    this.status = error.status;
    this.code = error.code;
    this.detail = error.detail;
  }

  toJSON(): ChirpStackError {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}
