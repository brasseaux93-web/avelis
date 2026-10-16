/**
 * In-process room teardown is not visible to the API process.
 * The room server exposes a loopback control plane so close/purge can destroy live sockets.
 */
import http from 'node:http';
import { evictParty, teardownRoom } from './memory';

export function createRoomControlServer(port: number, sharedSecret: string): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || (req.url !== '/internal/teardown' && req.url !== '/internal/evict-party')) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${sharedSecret}`) {
      res.statusCode = 401;
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
          sessionId?: string;
          partyId?: string;
        };
        if (req.url === '/internal/evict-party') {
          if (!body.sessionId || !body.partyId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const closed = evictParty(body.sessionId, body.partyId);
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, closed }));
          return;
        }
        if (!body.sessionId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false }));
          return;
        }
        const existed = teardownRoom(body.sessionId);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, existed }));
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
  });
  server.listen(port, process.env.ROOM_CONTROL_BIND || '127.0.0.1');
  return server;
}

export async function requestRoomTeardown(sessionId: string): Promise<boolean> {
  const secret = process.env.ROOM_SHARED_SECRET;
  const port = Number(process.env.ROOM_CONTROL_PORT || 3003);
  const host = process.env.ROOM_CONTROL_HOST || '127.0.0.1';
  if (!secret) return false;
  try {
    const res = await fetch(`http://${host}:${port}/internal/teardown`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { existed?: boolean };
    return Boolean(data.existed);
  } catch {
    return false;
  }
}

/** Ask the room server to disconnect a revoked party and refuse its reconnects. */
export async function requestPartyEviction(sessionId: string, partyId: string): Promise<boolean> {
  const secret = process.env.ROOM_SHARED_SECRET;
  const port = Number(process.env.ROOM_CONTROL_PORT || 3003);
  const host = process.env.ROOM_CONTROL_HOST || '127.0.0.1';
  if (!secret) return false;
  try {
    const res = await fetch(`http://${host}:${port}/internal/evict-party`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, partyId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
