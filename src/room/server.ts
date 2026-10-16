/**
 * Ephemeral WebSocket room server.
 * All room state lives in memory.ts. This file only wires ws + auth.
 *
 * Auth:
 * - Require query params: sessionId, partyId, roomToken.
 * - Accept roomToken ONLY if it equals HMAC-SHA256(sessionId + ":" + partyId, ROOM_SHARED_SECRET) hex.
 * - NEVER accept the raw ROOM_SHARED_SECRET as roomToken (including in development).
 * Reject with close code 1008 when missing/invalid.
 *
 * Never log room message bodies. Late joiners get no scrollback.
 */
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import { loadLocalEnv } from '../lib/loadEnv';
import { copilotStatus } from '../lib/processCopilot';
import {
  addParty,
  removeParty,
  ensureRoom,
  isPartyRevoked,
  deliverTo,
  type WebSocketLike,
} from './memory';
import { createRoomControlServer } from './control';
import { askedForAvelis, invokeAvelis, openChamber, rememberTurn, scheduleCoach, forgetCaucusWindow, publishAvelis, whisperFacilitator } from './conflictAgent';
import {
  closeCaucus,
  deliver,
  emitPresence,
  getCaucus,
  inCaucus,
  isCaucusOpen,
  notifyCaucusState,
  openCaucus,
  sanitizeProcessFact,
} from './caucus';
import { TECHNIQUES } from '../lib/processCopilot/techniques';
import { clearClock, setClock } from './clock';

export {
  teardownRoom,
  ensureRoom,
  hasRoom,
  activeRoomCount,
  broadcast,
  addParty,
  removeParty,
  createRoom,
  getRoom,
} from './memory';

const PORT = Number(process.env.ROOM_PORT || 3002);
const MESSAGE_MAX_BYTES = Number(process.env.ROOM_MESSAGE_MAX_BYTES || 8192);

/** Known placeholders that must never be used as ROOM_SHARED_SECRET in production. */
export const ROOM_SECRET_PLACEHOLDERS = new Set([
  'change-me-room-secret',
  'change-me',
  'change-me-room-secret-compose',
  'changeme',
  'secret',
  'password',
]);

export function assertRoomProductionSecrets(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.ROOM_SWAP_DISABLED === 'true') {
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'room_swap_disabled_documented',
        note: 'Host should disable swap for the room process (mem_limit / cgroup).',
        ts: new Date().toISOString(),
      })
    );
  }

  if (env.NODE_ENV !== 'production') return;

  const secret = env.ROOM_SHARED_SECRET;
  if (!secret || ROOM_SECRET_PLACEHOLDERS.has(secret) || secret.length < 24) {
    throw new Error(
      'Room server refused to start in production: ROOM_SHARED_SECRET missing, placeholder, or too short. Set a strong secret via env (never commit it).'
    );
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function expectedHmac(sessionId: string, partyId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(sessionId + ':' + partyId)
    .digest('hex');
}

/**
 * Validate roomToken. Raw shared secret is NEVER accepted as a token.
 */
export function isValidRoomToken(
  roomToken: string,
  sessionId: string,
  partyId: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const secret = env.ROOM_SHARED_SECRET;
  if (!secret) return false;
  if (timingSafeEqualHex(roomToken, secret)) return false;
  const hmac = expectedHmac(sessionId, partyId, secret);
  return timingSafeEqualHex(roomToken, hmac);
}

export function createRoomServer(port = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', 'http://' + (req.headers.host || 'localhost'));
    const sessionId = url.searchParams.get('sessionId');
    const partyId = url.searchParams.get('partyId');
    const roomToken = url.searchParams.get('roomToken');
    const identityClass = url.searchParams.get('identityClass') || 'unnamed';

    if (!sessionId || !partyId || !roomToken) {
      ws.close(1008, 'sessionId, partyId, and roomToken required');
      return;
    }

    if (!isValidRoomToken(roomToken, sessionId, partyId)) {
      ws.close(1008, 'Invalid roomToken');
      return;
    }

    if (isPartyRevoked(sessionId, partyId)) {
      ws.close(4003, 'Access revoked');
      return;
    }

    const socket = ws as unknown as WebSocketLike;
    (socket as WebSocketLike).OPEN = WebSocket.OPEN;

    ensureRoom(sessionId);
    addParty(sessionId, socket, { partyId, identityClass });
    emitPresence(sessionId);
    notifyCaucusState(sessionId);
    if (identityClass !== 'facilitator') {
      openChamber(sessionId);
    }

    ws.on('message', (data) => {
      let parsed: {
        type?: string;
        text?: string;
        prompt?: string;
        partyId?: string;
        processFact?: string;
        minutes?: number;
        to?: string;
        data?: unknown;
      };
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (parsed?.type === 'agent_invoke') {
        void invokeAvelis(sessionId, parsed.prompt, identityClass === 'facilitator' ? 'facilitator' : 'party');
        return;
      }

      if (parsed?.type === 'clock_set' && identityClass === 'facilitator') {
        if (parsed.minutes == null) {
          clearClock(sessionId);
          return;
        }
        setClock(sessionId, Number(parsed.minutes));
        return;
      }

      if (parsed?.type === 'signal' && typeof parsed.to === 'string') {
        // Signaling only. Not speech. Not stored. Not given to the agent.
        deliverTo(sessionId, parsed.to, {
          type: 'signal',
          from: partyId,
          data: parsed.data ?? null,
        });
        return;
      }

      if (parsed?.type === 'caucus_open' && identityClass === 'facilitator' && typeof parsed.partyId === 'string') {
        const opened = openCaucus(sessionId, parsed.partyId);
        if (!opened) return;
        notifyCaucusState(sessionId);
        deliver(sessionId, 'plenary', {
          type: 'notice',
          text: 'A private turn is open. Plenary is paused. Talk there does not return as quotes.',
          timestamp: Date.now(),
        });
        deliver(sessionId, 'caucus', {
          type: 'notice',
          text: 'Private turn. This talk is not stored. Process facts may return; quotes will not.',
          timestamp: Date.now(),
        });
        whisperFacilitator(sessionId, TECHNIQUES.caucus_shuttle.whisper, 'caucus_shuttle');
        publishAvelis(
          sessionId,
          'Private turn. I am here and you can see me. This talk stays here. What does a workable outcome have to do, for you?',
          'open_interests'
        );
        return;
      }

      if (parsed?.type === 'caucus_close' && identityClass === 'facilitator') {
        if (!getCaucus(sessionId)) return;
        const fact =
          typeof parsed.processFact === 'string' && parsed.processFact.trim()
            ? sanitizeProcessFact(parsed.processFact)
            : null;
        closeCaucus(sessionId);
        forgetCaucusWindow(sessionId);
        notifyCaucusState(sessionId);
        deliver(sessionId, 'plenary', {
          type: 'notice',
          text: fact ? `Private turn closed. Process fact: ${fact}.` : 'Private turn closed. Plenary continues.',
          timestamp: Date.now(),
        });
        return;
      }

      if (parsed?.type !== 'chat' || typeof parsed.text !== 'string') {
        return;
      }

      const text = parsed.text;
      const byteLen = Buffer.byteLength(text, 'utf8');
      if (byteLen > MESSAGE_MAX_BYTES) {
        try {
          ws.close(1009, 'Message too large');
        } catch {
          // ignore
        }
        return;
      }

      const caucusOpen = isCaucusOpen(sessionId);
      const senderIn = inCaucus(sessionId, { partyId, identityClass });

      if (caucusOpen && identityClass !== 'facilitator' && !senderIn) {
        try {
          ws.send(
            JSON.stringify({
              type: 'notice',
              channel: 'plenary',
              text: 'Plenary is paused while a private turn is open.',
              timestamp: Date.now(),
            })
          );
        } catch {
          // ignore
        }
        return;
      }

      const channel = caucusOpen && senderIn ? 'caucus' : 'plenary';

      deliver(sessionId, channel, {
        type: 'message',
        message: {
          id: crypto.randomUUID(),
          partyId,
          identityClass,
          text,
          timestamp: Date.now(),
        },
      });

      rememberTurn(
        sessionId,
        {
          speaker: identityClass === 'facilitator' ? 'facilitator' : 'party',
          identityClass,
          text,
        },
        channel
      );
      if (askedForAvelis(text) || (identityClass === 'facilitator' && /^\s*\/avelis\b/i.test(text))) {
        void invokeAvelis(sessionId, text);
      } else {
        scheduleCoach(sessionId);
      }
    });

    ws.on('close', () => {
      removeParty(sessionId, socket);
      emitPresence(sessionId);
    });
  });

  return wss;
}

if (process.env.VITEST !== 'true') {
  loadLocalEnv();
  assertRoomProductionSecrets();
  createRoomServer(PORT);
  const controlPort = Number(process.env.ROOM_CONTROL_PORT || 3003);
  const secret = process.env.ROOM_SHARED_SECRET || '';
  createRoomControlServer(controlPort, secret);
  const groq = copilotStatus();
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'room_listen',
      port: PORT,
      controlPort,
      groqConfigured: groq.configured,
      groqProvider: groq.provider,
      ts: new Date().toISOString(),
    })
  );
}
