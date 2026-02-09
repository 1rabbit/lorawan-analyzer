import type { ParsedPacket } from '../types.js';

// Join→Uplink correlation window
const CORRELATION_WINDOW_MS = 30_000;
// FCnt below this after a higher value = session reset (not rollover)
const FCNT_RESET_THRESHOLD = 50;
// No activity for this long = stale session
const STALE_SESSION_MS = 4 * 3600_000;
// 16-bit FCnt rollover boundary
const FCNT_16BIT_MAX = 65535;
// Cleanup interval
const CLEANUP_INTERVAL_MS = 5 * 60_000;
// Max age for pending joins
const PENDING_JOIN_MAX_AGE_MS = 2 * 60_000;

interface PendingJoin {
  dev_eui: string;
  join_eui: string;
  gateway_id: string;
  timestamp: number;
}

interface ActiveSession {
  session_id: string;
  dev_eui: string | null;
  last_fcnt: number;
  last_timestamp: number;
}

export interface SessionResult {
  session_id: string | null;
  dev_eui: string | null;
}

export class SessionTracker {
  private pendingJoins = new Map<string, PendingJoin>(); // keyed by dev_eui
  private activeSessions = new Map<string, ActiveSession>(); // keyed by dev_addr
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  processPacket(packet: ParsedPacket): SessionResult {
    if (packet.packet_type === 'join_request') {
      return this.handleJoinRequest(packet);
    }

    if (packet.packet_type === 'data' && packet.dev_addr) {
      return this.handleDataUplink(packet);
    }

    // downlink / tx_ack — no session tracking
    return { session_id: null, dev_eui: null };
  }

  private handleJoinRequest(packet: ParsedPacket): SessionResult {
    if (packet.dev_eui) {
      this.pendingJoins.set(packet.dev_eui, {
        dev_eui: packet.dev_eui,
        join_eui: packet.join_eui ?? '',
        gateway_id: packet.gateway_id,
        timestamp: packet.timestamp.getTime(),
      });
    }
    return { session_id: null, dev_eui: null };
  }

  private handleDataUplink(packet: ParsedPacket): SessionResult {
    const devAddr = packet.dev_addr!;
    const fcnt = packet.f_cnt;
    const now = packet.timestamp.getTime();
    const existing = this.activeSessions.get(devAddr);

    let needNewSession = false;

    if (!existing) {
      needNewSession = true;
    } else if (now - existing.last_timestamp > STALE_SESSION_MS) {
      // Stale — no packets for 4h
      needNewSession = true;
    } else if (fcnt !== null && existing.last_fcnt !== null) {
      if (this.isFCntReset(existing.last_fcnt, fcnt)) {
        needNewSession = true;
      }
    }

    if (needNewSession) {
      const sessionId = `${devAddr}_${Math.floor(now / 1000)}`;
      const devEui = this.correlateJoin(now);

      const session: ActiveSession = {
        session_id: sessionId,
        dev_eui: devEui,
        last_fcnt: fcnt ?? 0,
        last_timestamp: now,
      };
      this.activeSessions.set(devAddr, session);

      console.log(`[session] New session ${sessionId}${devEui ? ` (DevEUI=${devEui})` : ''}`);

      return { session_id: sessionId, dev_eui: devEui };
    }

    // Update existing session
    if (fcnt !== null) {
      existing!.last_fcnt = fcnt;
    }
    existing!.last_timestamp = now;

    return { session_id: existing!.session_id, dev_eui: existing!.dev_eui };
  }

  private isFCntReset(prevFcnt: number, newFcnt: number): boolean {
    if (newFcnt >= prevFcnt) {
      // Normal forward progression (or same). Check for 16-bit rollover.
      // If prev was near 65535 and new is near 0, it's a rollover, not a reset.
      return false;
    }

    // newFcnt < prevFcnt — backward jump
    // Check 16-bit rollover: prev near max, new near 0
    if (prevFcnt >= FCNT_16BIT_MAX - 10 && newFcnt < FCNT_RESET_THRESHOLD) {
      return false; // 16-bit rollover
    }

    // Large backward jump = new session
    return true;
  }

  private correlateJoin(uplinkTimestamp: number): string | null {
    // Find most recent pending join within the correlation window
    let bestMatch: PendingJoin | null = null;
    let bestAge = Infinity;

    for (const join of this.pendingJoins.values()) {
      const age = uplinkTimestamp - join.timestamp;
      if (age >= 0 && age <= CORRELATION_WINDOW_MS && age < bestAge) {
        bestMatch = join;
        bestAge = age;
      }
    }

    if (bestMatch) {
      // Consume the join so it's not matched again
      this.pendingJoins.delete(bestMatch.dev_eui);
      return bestMatch.dev_eui;
    }

    return null;
  }

  private cleanup(): void {
    const now = Date.now();

    // Remove stale pending joins (older than 2 min)
    for (const [key, join] of this.pendingJoins) {
      if (now - join.timestamp > PENDING_JOIN_MAX_AGE_MS) {
        this.pendingJoins.delete(key);
      }
    }

    // Remove stale sessions (older than 4h)
    for (const [key, session] of this.activeSessions) {
      if (now - session.last_timestamp > STALE_SESSION_MS) {
        this.activeSessions.delete(key);
      }
    }
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
