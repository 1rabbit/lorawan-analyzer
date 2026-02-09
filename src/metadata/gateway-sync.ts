import type { ChirpStackApiConfig } from '../types.js';

export class GatewaySync {
  private apiUrl: string;
  private apiKey: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onGatewayName: (gatewayId: string, name: string) => void;

  constructor(config: ChirpStackApiConfig, callback: (gatewayId: string, name: string) => void) {
    this.apiUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.api_key;
    this.onGatewayName = callback;
  }

  async start(): Promise<void> {
    await this.sync();
    this.timer = setInterval(() => this.sync(), 5 * 60 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sync(): Promise<void> {
    try {
      let offset = 0;
      const limit = 100;

      while (true) {
        const res = await fetch(`${this.apiUrl}/api/gateways?limit=${limit}&offset=${offset}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          console.error(`ChirpStack API error: ${res.status} ${res.statusText}`);
          return;
        }

        const data = await res.json() as { totalCount?: number; result?: Array<{ gatewayId?: string; name?: string }> };
        const gateways = data.result || [];

        for (const gw of gateways) {
          if (gw.gatewayId && gw.name) {
            this.onGatewayName(gw.gatewayId, gw.name);
          }
        }

        offset += gateways.length;
        if (gateways.length < limit) break;
      }
    } catch (err) {
      console.error('ChirpStack gateway sync error:', err);
    }
  }
}
