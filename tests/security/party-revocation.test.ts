import { afterEach, describe, expect, test } from 'vitest';
import { partyStatusAllowsAccess } from '../../src/lib/partyAccess';
import {
  _resetRoomsForTests,
  addParty,
  evictParty,
  getRoom,
  isPartyRevoked,
  type WebSocketLike,
} from '../../src/room/memory';

function fakeSocket() {
  const s = {
    readyState: 1,
    OPEN: 1,
    sent: [] as string[],
    closed: null as null | { code?: number; reason?: string },
    send(d: string) {
      this.sent.push(d);
    },
    close(code?: number, reason?: string) {
      this.closed = { code, reason };
      this.readyState = 3;
    },
  };
  return s as typeof s & WebSocketLike;
}

describe('revoked parties lose access', () => {
  afterEach(() => _resetRoomsForTests());

  test('API gate only allows pending/joined parties', () => {
    expect(partyStatusAllowsAccess('joined')).toBe(true);
    expect(partyStatusAllowsAccess('pending')).toBe(true);
    expect(partyStatusAllowsAccess('revoked')).toBe(false);
    expect(partyStatusAllowsAccess('left')).toBe(false);
    expect(partyStatusAllowsAccess('declined')).toBe(false);
    expect(partyStatusAllowsAccess(undefined)).toBe(false);
  });

  test('evictParty disconnects only the revoked party and blocks reconnects', () => {
    const revoked = fakeSocket();
    const other = fakeSocket();
    addParty('s1', revoked, { partyId: 'p-revoked', identityClass: 'party' });
    addParty('s1', other, { partyId: 'p-other', identityClass: 'party' });

    expect(evictParty('s1', 'p-revoked')).toBe(1);
    expect(revoked.closed?.code).toBe(4003);
    expect(other.closed).toBeNull();
    expect(getRoom('s1')?.parties.size).toBe(1);
    expect(isPartyRevoked('s1', 'p-revoked')).toBe(true);
    expect(isPartyRevoked('s1', 'p-other')).toBe(false);
    expect(isPartyRevoked('s2', 'p-revoked')).toBe(false);
  });

  test('revocation is recorded even if the party is not currently connected', () => {
    expect(evictParty('s3', 'p1')).toBe(0);
    expect(isPartyRevoked('s3', 'p1')).toBe(true);
  });
});
