import { createFileRoute, Link } from '@tanstack/react-router';
import React, { useCallback, useEffect, useState } from 'react';
import './sessions.css';
import { apiGet, apiPost } from '../lib/apiClient';

export const Route = createFileRoute('/party')({
  component: PartyViewPage,
});

type LedgerLine = {
  id: string;
  sequenceNumber: number;
  lineType: string;
  occurredAt: string;
  initialVisibility: string;
};

type MinutePayload = {
  minute: {
    id: string;
    status: string;
    content: string;
    contentDigest: string | null;
    initialedBy: string[];
  } | null;
  emptyState?: string;
};

let memoryPartyToken: string | null = null;

export function setPartyViewToken(token: string | null) {
  memoryPartyToken = token;
}

function PartyViewPage() {
  const [token] = useState(memoryPartyToken);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [emptyLedger, setEmptyLedger] = useState<string | undefined>();
  const [minute, setMinute] = useState<MinutePayload['minute']>(null);
  const [emptyMinute, setEmptyMinute] = useState<string | undefined>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async (partyToken: string) => {
    setError('');
    try {
      const ledger = (await apiGet('/api/party/session/ledger', { token: partyToken })) as {
        sessionId: string;
        lines: LedgerLine[];
        emptyState?: string;
      };
      setLines(ledger.lines);
      setEmptyLedger(ledger.emptyState);
      setSessionId(ledger.sessionId);

      const m = (await apiGet('/api/party/session/minute', { token: partyToken })) as MinutePayload;
      setMinute(m.minute);
      setEmptyMinute(m.emptyState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load party view.');
    }
  }, []);

  useEffect(() => {
    if (token) void refresh(token);
  }, [token, refresh]);

  async function initialMinute() {
    if (!token || !sessionId || !minute) return;
    setInfo('');
    try {
      await apiPost('/api/sessions/' + sessionId + '/minute/initial', {}, { token });
      setInfo('Minute initial recorded.');
      await refresh(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record minute initial.');
    }
  }

  return (
    <div className="sessions-page sessions-page--temporal">
      <p className="sessions-page__eyebrow">Process view</p>
      <h1 className="sessions-page__title">What was recorded as process</h1>
      <p className="sessions-disclosure" role="note">
        Room messages are delivered live and are not stored by Avelis. This view shows only process
        lines published to parties and any published joint minute.
      </p>

      {!token && (
        <p className="sessions-page__subtitle">
          Redeem an invite on <Link to="/join">the join page</Link>. This tab keeps your session
          token in memory only — there is nothing to paste.
        </p>
      )}

      {error && (
        <p className="sessions-error" role="alert">
          {error}
        </p>
      )}
      {info && <p className="sessions-page__subtitle">{info}</p>}

      {token && (
        <>
          <div className="sessions-panel">
            <h3>Visible ledger</h3>
            {lines.length === 0 ? (
              <div className="sessions-empty">
                <p className="sessions-empty__title">No visible process lines</p>
                <p className="sessions-empty__body">
                  {emptyLedger || 'No process lines are visible to parties yet.'}
                </p>
              </div>
            ) : (
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.sequenceNumber}</td>
                      <td>{line.lineType}</td>
                      <td>{new Date(line.occurredAt).toISOString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="sessions-panel">
            <h3>Joint minute</h3>
            {!minute ? (
              <div className="sessions-empty">
                <p className="sessions-empty__title">No published minute</p>
                <p className="sessions-empty__body">
                  {emptyMinute || 'No joint minute is published for parties.'}
                </p>
              </div>
            ) : (
              <>
                <p className="sessions-page__subtitle">
                  The joint minute is optional. It is separate from the live room and may be
                  exported or wiped.
                </p>
                <pre className="sessions-code-once" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                  {minute.content}
                </pre>
                <div className="sessions-actions">
                  <button type="button" className="btn btn--primary" onClick={() => void initialMinute()}>
                    Record initial
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
