import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';

export type CopilotAction = {
  id: string;
  kind: string;
  label: string;
  rationale: string;
  payload: Record<string, unknown>;
};

export type CopilotState = {
  stage: string;
  source: string;
  disclosure: string;
  questions: string[];
  actions: CopilotAction[];
  minuteOutline: string | null;
};

type Turn = { who: 'you' | 'copilot'; text: string };

type Status = { configured: boolean; provider: string; model: string | null };

export function ProcessAgent(props: {
  sessionId: string;
  disabled: boolean;
  onApply: (action: CopilotAction) => Promise<void>;
  copilot: CopilotState | null;
  busy: boolean;
  onConsult: () => Promise<void>;
}) {
  const { sessionId, disabled, onApply, copilot, busy, onConsult } = props;
  const [status, setStatus] = useState<Status | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    void apiGet<Status>('/api/process-copilot/status')
      .then(setStatus)
      .catch(() => setStatus({ configured: false, provider: 'none', model: null }));
  }, []);

  useEffect(() => {
    if (!disabled) void onConsult();
    // first paint only
  }, [sessionId]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    setAsking(true);
    setLocalError('');
    setTurns((t) => [...t, { who: 'you', text: q }]);
    setQuestion('');
    try {
      const res = (await apiPost('/api/sessions/' + sessionId + '/process-copilot/turn', {
        question: q,
      })) as { reply: string };
      setTurns((t) => [...t, { who: 'copilot', text: res.reply }]);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Could not complete process turn.');
    } finally {
      setAsking(false);
    }
  };

  const sourceLabel = copilot
    ? copilot.source === 'model'
      ? status?.provider === 'groq'
        ? 'Groq · process rules'
        : 'Model · process rules'
      : 'Playbook'
    : status?.configured
      ? 'Model ready'
      : 'Playbook';

  return (
    <aside className="agent-rail" aria-label="Process copilot">
      <header className="agent-rail__header">
        <p className="sessions-page__eyebrow">Process copilot</p>
        <p className="agent-rail__source">{sourceLabel}</p>
      </header>
      <p className="sessions-disclosure" role="note">
        {copilot?.disclosure ||
          'Uses process facts only. Does not read the live room. Does not write the ledger. You confirm every action.'}
      </p>

      {copilot && (
        <p className="copilot__meta">
          Stage <span className="sessions-status">{copilot.stage}</span>
        </p>
      )}

      {copilot?.questions && copilot.questions.length > 0 && (
        <div className="agent-chips" aria-label="Process questions">
          {copilot.questions.map((q) => (
            <button key={q} type="button" className="agent-chip" onClick={() => void ask(q)} disabled={asking || disabled}>
              {q}
            </button>
          ))}
        </div>
      )}

      {copilot?.actions && copilot.actions.length > 0 && (
        <ul className="copilot__actions">
          {copilot.actions.map((a) => (
            <li key={a.id}>
              <div>
                <p className="copilot__label">{a.label}</p>
                <p className="sessions-page__subtitle">{a.rationale}</p>
              </div>
              <button type="button" className="btn btn--secondary" onClick={() => void onApply(a)}>
                Confirm
              </button>
            </li>
          ))}
        </ul>
      )}

      {copilot?.minuteOutline && (
        <p className="sessions-page__subtitle">
          A joint-minute outline is ready from marked-agreed items. Confirm the draft action to insert
          it. Edit before you save.
        </p>
      )}

      <div className="agent-thread" aria-live="polite">
        {turns.map((t, i) => (
          <p key={i} className={'agent-turn agent-turn--' + t.who}>
            <span className="agent-turn__who">{t.who === 'you' ? 'You' : 'Copilot'}</span>
            {t.text}
          </p>
        ))}
      </div>

      <form
        className="agent-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="agent-q">Ask a process question</label>
        <textarea
          id="agent-q"
          rows={3}
          value={question}
          maxLength={400}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="How should I open this caucus?"
          disabled={disabled || asking}
        />
        <div className="sessions-actions">
          <button type="submit" className="btn btn--primary" disabled={disabled || asking || !question.trim()}>
            {asking ? 'Thinking…' : 'Ask'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => void onConsult()} disabled={disabled || busy}>
            {busy ? 'Reading process…' : 'Refresh actions'}
          </button>
        </div>
      </form>
      {localError && (
        <p className="sessions-error" role="alert">
          {localError}
        </p>
      )}
    </aside>
  );
}
