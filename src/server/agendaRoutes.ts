import express from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions, agendaItems } from '../db/schema';
import { appendLedgerLine } from '../lib/ledgerAppend';
import { sanitizeAgendaLabel } from '../lib/processCopilot/firewall';

export function registerAgendaRoutes(
  app: express.Express,
  requireAuth: express.RequestHandler
) {
  app.post('/api/sessions/:id/agenda', requireAuth, async (req, res) => {
    const sessionId = req.params.id;
    const facilitatorId = req.facilitatorId!;
    const rawTitle = req.body?.title;
    if (!rawTitle || typeof rawTitle !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }
    const title = sanitizeAgendaLabel(rawTitle);

    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.facilitatorId !== facilitatorId) {
        return res.status(403).json({ error: 'Not authorized for this session.' });
      }

      const item = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ sortOrder: agendaItems.sortOrder })
          .from(agendaItems)
          .where(eq(agendaItems.sessionId, sessionId))
          .orderBy(desc(agendaItems.sortOrder))
          .limit(1);
        const sortOrder = existing[0] ? existing[0].sortOrder + 1 : 0;

        const [created] = await tx
          .insert(agendaItems)
          .values({
            sessionId,
            title,
            sortOrder,
            status: 'tabled',
          })
          .returning();

        await appendLedgerLine(tx, {
          sessionId,
          lineType: 'agenda_item_tabled',
          payload: { itemId: created.id },
          actorKind: 'facilitator',
          actorRef: facilitatorId,
          source: 'facilitator_ui',
          initialVisibility: 'facilitator_only',
        });

        return created;
      });

      res.status(201).json(item);
    } catch (error) {
      console.error('[API] Failed to create agenda item', error);
      res.status(500).json({ error: 'Could not create agenda item.' });
    }
  });

  app.patch('/api/sessions/:id/agenda/:itemId', requireAuth, async (req, res) => {
    const sessionId = req.params.id;
    const itemId = req.params.itemId;
    const facilitatorId = req.facilitatorId!;
    const { status, sortOrder } = req.body || {};

    const allowed = new Set(['agreed', 'parked', 'refused', 'tabled']);
    if (status != null && !allowed.has(status)) {
      return res.status(400).json({ error: 'status must be agreed|parked|refused|tabled' });
    }

    try {
      const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.facilitatorId !== facilitatorId) {
        return res.status(403).json({ error: 'Not authorized for this session.' });
      }

      const updated = await db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(agendaItems)
          .where(and(eq(agendaItems.id, itemId), eq(agendaItems.sessionId, sessionId)))
          .limit(1);
        if (!item) return null;

        const patch: { status?: typeof item.status; sortOrder?: number; updatedAt: Date } = {
          updatedAt: new Date(),
        };
        if (status) patch.status = status;
        if (typeof sortOrder === 'number') patch.sortOrder = sortOrder;

        const [row] = await tx
          .update(agendaItems)
          .set(patch)
          .where(eq(agendaItems.id, itemId))
          .returning();

        if (status && status !== item.status) {
          await appendLedgerLine(tx, {
            sessionId,
            lineType: 'agenda_item_marked',
            payload: { itemId, mark: status },
            actorKind: 'facilitator',
            actorRef: facilitatorId,
            source: 'facilitator_ui',
            initialVisibility: 'facilitator_only',
          });
        }
        if (typeof sortOrder === 'number' && sortOrder !== item.sortOrder) {
          await appendLedgerLine(tx, {
            sessionId,
            lineType: 'agenda_item_reordered',
            payload: {
              itemId,
              fromSortOrder: item.sortOrder,
              toSortOrder: sortOrder,
            },
            actorKind: 'facilitator',
            actorRef: facilitatorId,
            source: 'facilitator_ui',
            initialVisibility: 'facilitator_only',
          });
        }

        return row;
      });

      if (!updated) return res.status(404).json({ error: 'Agenda item not found' });
      res.status(200).json(updated);
    } catch (error) {
      console.error('[API] Failed to update agenda item', error);
      res.status(500).json({ error: 'Could not update agenda item.' });
    }
  });
}
