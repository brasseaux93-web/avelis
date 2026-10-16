/**
 * Pure in-memory room registry.
 * Product Law: Speech is memory-only. The live feed is deliver-and-drop.
 * Late joiners get no scrollback. Never log bodies.
 */

/** Minimal socket surface so tests can mock without real `ws`. */
export interface WebSocketLike {
  readyState: number;
  OPEN: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface PartyMeta {
  partyId: string;
  identityClass: string;
}

export interface RoomState {
  sessionId: string;
  parties: Map<WebSocketLike, PartyMeta>;
  createdAt: number;
  // Intentionally NO messages / history buffer on the room object.
}

const rooms = new Map<string, RoomState>();
const teardownHooks: Array<(sessionId: string) => void> = [];

export function onRoomTeardown(hook: (sessionId: string) => void): void {
  teardownHooks.push(hook);
}

export function createRoom(sessionId: string): RoomState {
  const room: RoomState = {
    sessionId,
    parties: new Map(),
    createdAt: Date.now(),
  };
  rooms.set(sessionId, room);
  return room;
}

export function getRoom(sessionId: string): RoomState | undefined {
  return rooms.get(sessionId);
}

export function ensureRoom(sessionId: string): RoomState {
  const existing = rooms.get(sessionId);
  if (existing) return existing;
  return createRoom(sessionId);
}

export function hasRoom(sessionId: string): boolean {
  return rooms.has(sessionId);
}

export function activeRoomCount(): number {
  return rooms.size;
}

export function addParty(
  sessionId: string,
  socket: WebSocketLike,
  meta: PartyMeta
): RoomState {
  const room = ensureRoom(sessionId);
  room.parties.set(socket, meta);
  return room;
}

export function removeParty(sessionId: string, socket: WebSocketLike): void {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.parties.delete(socket);
}

/**
 * Broadcast payload to all open sockets in the room.
 * Does NOT store the payload. Buffer is released after delivery.
 */
export function broadcast(sessionId: string, payload: unknown): number {
  return broadcastWhere(sessionId, payload, () => true);
}

export function deliverTo(sessionId: string, partyId: string, payload: unknown): number {
  return broadcastWhere(sessionId, payload, (meta) => meta.partyId === partyId);
}

export function broadcastWhere(
  sessionId: string,
  payload: unknown,
  predicate: (meta: PartyMeta) => boolean
): number {
  const room = rooms.get(sessionId);
  if (!room) return 0;

  const serialized = JSON.stringify(payload);
  let delivered = 0;
  for (const [socket, meta] of room.parties) {
    if (!predicate(meta)) continue;
    if (socket.readyState === socket.OPEN) {
      try {
        socket.send(serialized);
        delivered += 1;
      } catch {
        // Ignore send failures; do not log payload.
      }
    }
  }
  return delivered;
}

/**
 * Close all sockets, clear party map, run teardown hooks, delete room entry.
 */
export function teardownRoom(sessionId: string): boolean {
  const room = rooms.get(sessionId);
  for (const hook of teardownHooks) {
    try {
      hook(sessionId);
    } catch {
      // Hooks must not throw through teardown.
    }
  }
  if (!room) return false;

  for (const [socket] of room.parties) {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'room_closed' }));
      }
      socket.close(1000, 'Session Closed');
    } catch {
      // Ignore close errors.
    }
  }
  room.parties.clear();
  rooms.delete(sessionId);
  revokedParties.delete(sessionId);
  return true;
}

const revokedParties = new Map<string, Set<string>>();

/** Mark a party as revoked for a session and close any of its live sockets. Returns sockets closed. */
export function evictParty(sessionId: string, partyId: string): number {
  let set = revokedParties.get(sessionId);
  if (!set) {
    set = new Set();
    revokedParties.set(sessionId, set);
  }
  set.add(partyId);
  const room = rooms.get(sessionId);
  if (!room) return 0;
  let closed = 0;
  for (const [socket, meta] of [...room.parties]) {
    if (meta.partyId !== partyId) continue;
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'access_revoked' }));
      }
      socket.close(4003, 'Access revoked');
    } catch {
      // Ignore close errors.
    }
    room.parties.delete(socket);
    closed += 1;
  }
  return closed;
}

export function isPartyRevoked(sessionId: string, partyId: string): boolean {
  return revokedParties.get(sessionId)?.has(partyId) ?? false;
}

/** Test-only: wipe all rooms (not used in production paths). */
export function _resetRoomsForTests(): void {
  revokedParties.clear();
  for (const id of [...rooms.keys()]) {
    for (const hook of teardownHooks) {
      try {
        hook(id);
      } catch {
        /* ignore */
      }
    }
  }
  rooms.clear();
}
