import { requestPartyEviction } from '../room/control';
import express from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions, parties } from '../db/schema';
import { appendLedgerLine } from '../lib/ledgerAppend';
import { generateInviteCode } from '../lib/invite';
import { emailConfigured, emailDomainOnly, isSafeEmailAddress, sendInviteEmail } from '../lib/email';
import { logEvent } from '../lib/observability';

function publicOrigin(req: express.Request): string {
  const configured = process.env.PUBLIC_APP_ORIGIN || process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  const xfProto = req.headers['x-forwarded-proto'];
  const proto = typeof xfProto === 'string' ? xfProto.split(',')[0]!.trim() : req.protocol;
  const host = req.get('host') || 'localhost:5173';
  return `${proto}://${host}`;
}

export function registerInviteActionRoutes(
  app: express.Express,
  requireAuth: express.RequestHandler
) {
  app.post('/api/sessions/:id/invites/:partyId/resend', requireAuth, async (req, res) => {
    const sessionId = req.params.id;
    const partyId = req.params.partyId;
    const facilitatorId = req.facilitatorId!;
    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.facilitatorId !== facilitatorId) {
        return res.status(403).json({ error: 'Not authorized for this session.' });
      }
      if (session.status !== 'draft' && session.status !== 'open') {
        return res.status(409).json({ error: 'Invites only allowed for draft or open sessions' });
      }
      const [party] = await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, partyId), eq(parties.sessionId, sessionId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.inviteStatus === 'revoked' || party.inviteStatus === 'joined') {
        return res.status(409).json({ error: `Cannot resend invite with status ${party.inviteStatus}` });
      }
      const { code, hash } = generateInviteCode();
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(parties)
          .set({ inviteCodeHash: hash, inviteStatus: 'pending' })
          .where(eq(parties.id, partyId))
          .returning();
        await appendLedgerLine(tx, {
          sessionId,
          lineType: 'invite_created',
          payload: { partyId, deliveryChannel: 'copy_link' },
          actorKind: 'facilitator',
          actorRef: facilitatorId,
          source: 'application_server',
          initialVisibility: 'facilitator_only',
        });
        return row;
      });
      res.status(200).json({
        party: {
          id: updated.id,
          sessionId: updated.sessionId,
          identityClass: updated.identityClass,
          displayLabel: updated.displayLabel,
          inviteStatus: updated.inviteStatus,
        },
        inviteCode: code,
      });
    } catch (error) {
      logEvent('error', 'invite_resend_failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ error: 'Could not resend invite.' });
    }
  });

  app.post('/api/sessions/:id/invites/:partyId/revoke', requireAuth, async (req, res) => {
    const sessionId = req.params.id;
    const partyId = req.params.partyId;
    const facilitatorId = req.facilitatorId!;
    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.facilitatorId !== facilitatorId) {
        return res.status(403).json({ error: 'Not authorized for this session.' });
      }
      const [party] = await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, partyId), eq(parties.sessionId, sessionId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.inviteStatus === 'revoked') {
        return res.status(409).json({ error: 'Invite already revoked' });
      }
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(parties)
          .set({ inviteStatus: 'revoked', inviteCodeHash: null, deliveryAddress: null })
          .where(eq(parties.id, partyId))
          .returning();
        await appendLedgerLine(tx, {
          sessionId,
          lineType: 'invite_revoked',
          payload: { partyId },
          actorKind: 'facilitator',
          actorRef: facilitatorId,
          source: 'application_server',
          initialVisibility: 'facilitator_only',
        });
        return row;
      });
      // Cut any live room connection for this party (best effort; room also rejects reconnects).
      await requestPartyEviction(sessionId, partyId);
      res.status(200).json({ party: { id: updated.id, inviteStatus: updated.inviteStatus } });
    } catch (error) {
      logEvent('error', 'invite_revoke_failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ error: 'Could not revoke invite.' });
    }
  });

  app.post('/api/sessions/:id/invites/:partyId/deliver', requireAuth, async (req, res) => {
    const sessionId = req.params.id;
    const partyId = req.params.partyId;
    const facilitatorId = req.facilitatorId!;
    const body = req.body || {};
    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.facilitatorId !== facilitatorId) {
        return res.status(403).json({ error: 'Not authorized for this session.' });
      }
      if (session.status !== 'draft' && session.status !== 'open') {
        return res.status(409).json({ error: 'Delivery only allowed for draft or open sessions' });
      }
      const [party] = await db
        .select()
        .from(parties)
        .where(and(eq(parties.id, partyId), eq(parties.sessionId, sessionId)))
        .limit(1);
      if (!party) return res.status(404).json({ error: 'Party not found' });
      if (party.inviteStatus === 'revoked' || party.inviteStatus === 'joined') {
        return res.status(409).json({ error: `Cannot deliver invite with status ${party.inviteStatus}` });
      }
      const requested =
        typeof body.deliveryAddress === 'string' && body.deliveryAddress.trim() !== ''
          ? body.deliveryAddress.trim()
          : null;
      if (requested !== null && !isSafeEmailAddress(requested)) {
        return res.status(400).json({ error: 'Invalid delivery address' });
      }
      const stored = isSafeEmailAddress(party.deliveryAddress) ? party.deliveryAddress : null;
      const deliveryAddress = requested ?? stored;
      const { code, hash } = generateInviteCode();
      await db
        .update(parties)
        .set({
          inviteCodeHash: hash,
          inviteStatus: 'pending',
          deliveryAddress: deliveryAddress || party.deliveryAddress,
        })
        .where(eq(parties.id, partyId));
      const joinUrl = `${publicOrigin(req)}/join?code=${encodeURIComponent(code)}`;
      const smtpReady = emailConfigured() && Boolean(deliveryAddress);
      if (smtpReady && deliveryAddress) {
        const result = await sendInviteEmail({
          to: deliveryAddress,
          inviteCode: code,
          joinUrl,
          sessionTitle: session.title,
        });
        await db.transaction(async (tx) => {
          if (result.ok) {
            await appendLedgerLine(tx, {
              sessionId,
              lineType: 'invite_sent',
              payload: { partyId, deliveryChannel: 'email', result: 'sent' },
              actorKind: 'system',
              source: 'application_server',
              initialVisibility: 'facilitator_only',
            });
          } else {
            await appendLedgerLine(tx, {
              sessionId,
              lineType: 'invite_delivery_failed',
              payload: {
                partyId,
                deliveryChannel: 'email',
                reasonCode:
                  result.reason === 'not_configured' ? 'delivery_unavailable' : 'provider_rejected',
              },
              actorKind: 'system',
              source: 'application_server',
              initialVisibility: 'facilitator_only',
            });
          }
        });
        logEvent('info', 'invite_deliver_attempt', {
          sessionId,
          channel: 'email',
          delivered: result.ok,
          emailDomain: emailDomainOnly(deliveryAddress),
        });
        if (result.ok) {
          return res.status(200).json({ delivered: true, channel: 'email', joinUrl, inviteCode: code });
        }
      } else {
        await db.transaction(async (tx) => {
          await appendLedgerLine(tx, {
            sessionId,
            lineType: 'invite_delivery_failed',
            payload: {
              partyId,
              deliveryChannel: 'email',
              reasonCode: 'delivery_unavailable',
            },
            actorKind: 'system',
            source: 'application_server',
            initialVisibility: 'facilitator_only',
          });
        });
        logEvent('info', 'invite_deliver_copy_link', {
          sessionId,
          channel: 'copy_link',
          smtpConfigured: emailConfigured(),
        });
      }
      res.status(200).json({
        delivered: false,
        channel: 'copy_link',
        inviteCode: code,
        joinUrl,
      });
    } catch (error) {
      logEvent('error', 'invite_deliver_failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      res.status(500).json({ error: 'Could not deliver invite.' });
    }
  });
}
