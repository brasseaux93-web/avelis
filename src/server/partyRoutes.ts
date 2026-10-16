import express from 'express';
import { and, eq, asc, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions, ledgerLines, jointMinutes, parties } from '../db/schema';
import { verifyPartySessionToken } from '../lib/auth';
import { appendLedgerLine } from '../lib/ledgerAppend';
import { decryptJson } from '../lib/encryption';
import { getJointMinute } from './minute';
import { partyStatusAllowsAccess } from '../lib/partyAccess';

declare global {
  namespace Express {
    interface Request {
      partyId?: string;
      partySessionId?: string;
    }
  }
}

const requirePartyAuth: express.RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Party credentials are missing.' });
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyPartySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Party credentials are missing.' });
  }
  try {
    // Tokens are stateless; re-check the party row so revocation takes effect immediately.
    const [party] = await db
      .select({ inviteStatus: parties.inviteStatus })
      .from(parties)
      .where(and(eq(parties.id, payload.partyId), eq(parties.sessionId, payload.sessionId)))
      .limit(1);
    if (!party || !partyStatusAllowsAccess(party.inviteStatus)) {
      return res.status(403).json({ error: 'Party access has been revoked.' });
    }
  } catch (error) {
    console.error('[API] party auth lookup failed', error);
    return res.status(500).json({ error: 'Could not verify party access.' });
  }
  req.partyId = payload.partyId;
  req.partySessionId = payload.sessionId;
  next();
};

export function computePartyVisibleLines(
  lines: Array<{
    id: string;
    sequenceNumber: number;
    lineType: string;
    initialVisibility: string;
    payload: Record<string, unknown>;
    occurredAt: Date | string;
  }>
) {
  const visible = new Set<string>();
  for (const line of lines) {
    if (line.initialVisibility === 'party_visible') {
      visible.add(line.id);
    }
    if (line.lineType === 'ledger_line_published') {
      const target =
        (typeof line.payload.lineId === 'string' && line.payload.lineId) ||
        (typeof line.payload.target_line_id === 'string' && line.payload.target_line_id) ||
        null;
      if (target) visible.add(target);
    }
    if (line.lineType === 'ledger_line_withdrawn_from_party_view') {
      const target =
        (typeof line.payload.lineId === 'string' && line.payload.lineId) ||
        (typeof line.payload.target_line_id === 'string' && line.payload.target_line_id) ||
        null;
      if (target) visible.delete(target);
    }
  }
  return lines
    .filter((l) => visible.has(l.id))
    .map((l) => ({
      id: l.id,
      sequenceNumber: l.sequenceNumber,
      lineType: l.lineType,
      occurredAt: l.occurredAt,
      initialVisibility: l.initialVisibility,
    }));
}

export function registerPartyRoutes(app: express.Express) {
  app.get('/api/party/session/ledger', requirePartyAuth, async (req, res) => {
    const sessionId = req.partySessionId!;
    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status === 'purged') {
        return res.status(410).json({
          error: 'Session records were destroyed. The destruction receipt remains.',
          lines: [],
        });
      }
      const lines = await db
        .select({
          id: ledgerLines.id,
          sequenceNumber: ledgerLines.sequenceNumber,
          lineType: ledgerLines.lineType,
          initialVisibility: ledgerLines.initialVisibility,
          payload: ledgerLines.payload,
          occurredAt: ledgerLines.occurredAt,
        })
        .from(ledgerLines)
        .where(eq(ledgerLines.sessionId, sessionId))
        .orderBy(asc(ledgerLines.sequenceNumber));
      const visible = computePartyVisibleLines(
        await Promise.all(
          lines.map(async (l) => ({
            ...l,
            payload: ((await decryptJson(l.payload)) || {}) as Record<string, unknown>,
          }))
        )
      );
      res.status(200).json({
        sessionId,
        lines: visible,
        emptyState:
          visible.length === 0 ? 'No process lines are visible to parties yet.' : undefined,
      });
    } catch (error) {
      console.error('[API] party ledger failed', error);
      res.status(500).json({ error: 'Could not list party ledger.' });
    }
  });

  app.get('/api/party/session/minute', requirePartyAuth, async (req, res) => {
    const sessionId = req.partySessionId!;
    try {
      const minute = await getJointMinute(sessionId);
      if (!minute || minute.status !== 'published' || !minute.content) {
        return res.status(200).json({
          minute: null,
          emptyState: 'No joint minute is published for parties.',
        });
      }
      res.status(200).json({
        minute: {
          id: minute.id,
          status: minute.status,
          content: minute.content,
          contentDigest: minute.contentDigest,
          initialedBy: minute.initialedBy || [],
        },
      });
    } catch (error) {
      console.error('[API] party minute failed', error);
      res.status(500).json({ error: 'Could not load joint minute.' });
    }
  });

  app.post('/api/sessions/:id/minute/initial', requirePartyAuth, async (req, res) => {
    const sessionId = req.params.id;
    const partyId = req.partyId!;
    if (req.partySessionId !== sessionId) {
      return res.status(403).json({ error: 'Not authorized for this session.' });
    }
    try {
      const minute = await getJointMinute(sessionId);
      if (!minute || minute.status !== 'published' || !minute.contentDigest) {
        return res.status(404).json({ error: 'Published joint minute not found.' });
      }
      // Atomic + idempotent: the conditional UPDATE only succeeds once per party, and the
      // ledger line is written in the same transaction, so retries/races cannot duplicate it.
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(jointMinutes)
          .set({
            initialedBy: sql`array_append(coalesce(${jointMinutes.initialedBy}, '{}'::uuid[]), ${partyId}::uuid)`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jointMinutes.id, minute.id),
              eq(jointMinutes.status, 'published'),
              sql`not (${partyId}::uuid = any(coalesce(${jointMinutes.initialedBy}, '{}'::uuid[])))`
            )
          )
          .returning();
        if (!row) return null;
        await appendLedgerLine(tx, {
          sessionId,
          lineType: 'joint_minute_initialed',
          payload: {
            minuteId: minute.id,
            partyId,
            contentDigest: minute.contentDigest,
          },
          actorKind: 'party',
          actorRef: partyId,
          source: 'party_ui',
          initialVisibility: 'party_visible',
        });
        return row;
      });
      if (!updated) {
        const current = await getJointMinute(sessionId);
        return res.status(200).json({
          id: minute.id,
          status: current?.status ?? minute.status,
          initialedBy: current?.initialedBy ?? minute.initialedBy,
          alreadyInitialed: true,
        });
      }
      res.status(200).json({
        id: updated.id,
        status: updated.status,
        initialedBy: updated.initialedBy,
        alreadyInitialed: false,
      });
    } catch (error) {
      console.error('[API] minute initial failed', error);
      res.status(500).json({ error: 'Could not record minute initial.' });
    }
  });
}
