import React, { useEffect, useState } from 'react';
import { VerificationStamp, ProtocolMark } from '../components/Logo';

import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      setFormError((err instanceof Error && err.message) || 'A network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  useEffect(() => {
    document.documentElement.classList.add('reveal-enabled');
    const revealElements = document.querySelectorAll('[data-reveal]');
    
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.1,
        rootMargin: '0px 0px -60px 0px'
      });

      revealElements.forEach((el) => {
        revealObserver.observe(el);
      });

      return () => {
        revealElements.forEach((el) => {
          revealObserver.unobserve(el);
        });
      };
    } else {
      revealElements.forEach((el) => {
        el.classList.add('is-visible');
      });
    }
  }, []);

  return (
    <>
    {/* Hero */}
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <div className="hero__grid">
          <div className="hero__content">
            <p className="hero__eyebrow">AI CONFLICT RESOLUTION · PRIVATE ROOMS</p>
            <h1 className="hero__title" id="hero-title">
              Private rooms for difficult conversations. Avelis sits in the room — then the talk is gone.
            </h1>
            <p className="hero__body">
              Avelis is an AI conflict-resolution operating system for facilitators. Parties join a
              private live room. Avelis is a visible conflict agent: it asks process questions, names
              the problem without the people, and never writes the ledger. Room messages are not stored.
              A process record is destroyed on a deadline you choose.
            </p>
            <div className="hero__actions">
              <Link to="/evaluation" className="btn btn--primary btn--lg">Request Institutional Evaluation</Link>
              <Link to="/threat-model" className="btn btn--secondary btn--lg">Review Threat Model</Link>
            </div>

            <div className="hero__ioa-block">
              <span className="hero__ioa-header">Conflict agent // Speech non-persistence</span>
              <p className="hero__ioa-text">
                Avelis is in the room while it is open. Inference sees a rolling window in RAM, not a
                file. Closing destroys the live room. The process copilot still cannot write ledger lines.
              </p>
              <div className="hero__ioa-badges">
                <span className="hero__ioa-badge">Visible agent</span>
                <span className="hero__ioa-badge">No stored transcript</span>
              </div>
            </div>
          </div>

          <div className="hero__visual-wrap">
            <div className="hero__visual" aria-label="Example facilitator process ledger showing closed vocabulary lines">
              <div className="process-ledger-card">
              <div className="process-ledger-card__header">
                <span className="process-ledger-card__title">
                  <ProtocolMark className="process-ledger-card__logo" accent="currentColor" />
                  Session · Process Ledger
                </span>
                <span className="process-ledger-card__status">
                  <span className="process-ledger-card__status-dot"></span>
                  Closed
                </span>
              </div>
              <div className="process-ledger-card__body">

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:14</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Session Opened</span>
                    <span className="ledger-detail">retention: 72h</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:15</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Party Invited</span>
                    <span className="ledger-detail">class: role-only</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:17</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Party Joined</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:22</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Item Tabled</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:28</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Caucus Created</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">09:45</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Marked Agreed</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">10:02</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Minute Drafted</span>
                  </div>
                </div>

                <div className="ledger-row">
                  <div className="ledger-ts-col">10:14</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action">Session Closed</span>
                  </div>
                </div>

                <div className="ledger-row ledger-row--destroy">
                  <div className="ledger-ts-col">10:14</div>
                  <div className="ledger-content-col">
                    <span className="ledger-action ledger-action--stamped">Destruction Attested</span>
                    <span className="ledger-detail ledger-detail--attest">
                      Destruction receipt generated. Room messages were not stored.
                    </span>
                    <div className="destruction-seal" aria-hidden="true">
                      <VerificationStamp />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="hero-buyers" id="audience">
          <div className="hero-buyer-card">
            <h3 className="hero-buyer-title">University &amp; institutional ombuds offices</h3>
            <p className="hero-buyer-desc">Facilitated shuttle talks with an ephemeral room and a process ledger retained only for the selected window.</p>
          </div>
          <div className="hero-buyer-card">
            <h3 className="hero-buyer-title">Enterprise HR &amp; employee relations</h3>
            <p className="hero-buyer-desc">Early workplace dispute facilitation without storing room messages or creating a transcript.</p>
          </div>
          <div className="hero-buyer-card">
            <h3 className="hero-buyer-title">Track 1.5 / Track II facilitation</h3>
            <p className="hero-buyer-desc">Bounded sessions for sensitive negotiation with live delivery and scheduled destruction of process records.</p>
          </div>
          <div className="hero-buyer-card">
            <h3 className="hero-buyer-title">Corporate governance, ADR &amp; boards</h3>
            <p className="hero-buyer-desc">Facilitator-controlled sessions for high-stakes discussions where process accountability matters and speech is not retained.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="duality" aria-labelledby="duality-title" data-reveal>
      <div className="container">
        <h2 className="sr-only" id="duality-title">What Avelis is and is not</h2>
        <div className="duality__grid">
          <div className="duality__col duality__col--is">
            <p className="duality__label duality__label--is">Avelis is</p>
            <ul className="duality__list" role="list">
              <li className="duality__item">
                <span className="duality__item-mark duality__item-mark--is">+</span>
                A facilitator operating system for bounded sessions
              </li>
              <li className="duality__item">
                <span className="duality__item-mark duality__item-mark--is">+</span>
                A visible conflict agent that runs named mediation moves and never writes the ledger
              </li>
              <li className="duality__item">
                <span className="duality__item-mark duality__item-mark--is">+</span>
                A session: ephemeral room, process ledger, optional joint minute, destruction receipt
              </li>
              <li className="duality__item">
                <span className="duality__item-mark duality__item-mark--is">+</span>
                A closed-vocabulary process ledger (invitations, identity classes, agenda marks, joint-minute lifecycle)
              </li>
              <li className="duality__item">
                <span className="duality__item-mark duality__item-mark--is">+</span>
                A system that retains process records only until the selected destruction deadline
              </li>
            </ul>
          </div>
          <div className="duality__col duality__col--is-not">
            <p className="duality__label duality__label--is-not">Avelis is not</p>
            <ul className="duality__list" role="list">
              <li className="duality__item duality__item--muted">
                <span className="duality__item-mark duality__item-mark--is-not">&minus;</span>
                Not a conversation archive or transcript system
              </li>
              <li className="duality__item duality__item--muted">
                <span className="duality__item-mark duality__item-mark--is-not">&minus;</span>
                Not a recording, replay, or scrollback product
              </li>
              <li className="duality__item duality__item--muted">
                <span className="duality__item-mark duality__item-mark--is-not">&minus;</span>
                Not an AI judge, hidden listener, or sentiment engine
              </li>
              <li className="duality__item duality__item--muted">
                <span className="duality__item-mark duality__item-mark--is-not">&minus;</span>
                Not a case-management, investigation, or whistleblowing system
              </li>
              <li className="duality__item duality__item--muted">
                <span className="duality__item-mark duality__item-mark--is-not">&minus;</span>
                Not a social network, public membership space, or forum
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section className="principles" id="why" aria-labelledby="why-title" data-reveal>
      <div className="container">
        <div className="principles__header">
          <p className="section-eyebrow">What others will not do</p>
          <h2 className="section-title" id="why-title">Three facts no competitor will copy.</h2>
          <p className="section-desc">
            AI judges keep the file. Consumer bots skip the facilitator. Video suites hide the
            listener. Avelis is the other product.
          </p>
        </div>
        <div className="principles__list">
          <article className="principle">
            <p className="principle__code">01</p>
            <h3 className="principle__title">The room has no file</h3>
            <p className="principle__body">
              Speech lives in RAM while the session is open. A private turn is a real caucus — plenary
              pauses, quotes do not return. Optional voice is browser-to-browser; Avelis does not hear
              it. Closing destroys the live room. A destruction receipt is the proof.
            </p>
          </article>
          <article className="principle">
            <p className="principle__code">02</p>
            <h3 className="principle__title">The third is named</h3>
            <p className="principle__body">
              Avelis sits in the room. Everyone can see the current move. There is no hidden
              listener, no sentiment score, no AI award.
            </p>
          </article>
          <article className="principle">
            <p className="principle__code">03</p>
            <h3 className="principle__title">The facilitator writes the record</h3>
            <p className="principle__body">
              Named moves from principled negotiation, shuttle, and single-text. The agent never
              writes a ledger line. Process is confirmed by a human.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section className="principles" id="principles" aria-labelledby="principles-title" data-reveal>
      <div className="container">
        <div className="principles__header">
          <p className="section-eyebrow">Product Laws</p>
          <h2 className="section-title" id="principles-title">Speech is not retained. Process may be, until destruction.</h2>
          <p className="section-desc">
            Avelis exists on that seam. These laws are non-negotiable. If a feature conflicts with them, the feature is wrong.
          </p>
        </div>

        <div className="principles__list">
          <article className="principle principle--flagship">
            <p className="principle__code"><span>L1 — Speech is ephemeral</span></p>
            <h3 className="principle__title">The room does not persist</h3>
            <p className="principle__desc">
              Room messages are delivered live and are not stored by Avelis.
              When the session closes, the live room ends. No scrollback after close. No recording. No transcript. No save.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L2 — The ledger is process, not speech</p>
            <h3 className="principle__title">A closed vocabulary of process lines</h3>
            <p className="principle__desc">
              Session opened. Party invited. Item tabled. Marked agreed, parked, or refused.
              Minute drafted. Destruction attested. Never quotes, paraphrases, sentiment, or
              facilitator notes about a person.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L3 — The facilitator authors the ledger</p>
            <h3 className="principle__title">No model writes a ledger line</h3>
            <p className="principle__desc">
              A process copilot may rank next process actions from the ledger. It does not read the
              room. The facilitator confirms every line.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L4 — Identity is a class, not a profile</p>
            <h3 className="principle__title">Named, role-only, affiliation-only, or unnamed</h3>
            <p className="principle__desc">
              No standing social profile. No follower graph. No cross-session participant
              directory visible to other parties. The facilitator&apos;s address book is private.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L5 — Destruction is a feature</p>
            <h3 className="principle__title">Every session has an explicit end</h3>
            <p className="principle__desc">
              End means: speech gone, optional minute exported, ledger retained only for the
              retention window the facilitator set at open. Default 72 hours after close,
              configurable 0 to 30 days. A destruction receipt is written. There is no undelete.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L6 — The Facilitator Controls the Boundary</p>
            <h3 className="principle__title">No one joins uninvited</h3>
            <p className="principle__desc">
              The facilitator controls invitations and party access. Room messages are delivered only to connected parties for the active session.
            </p>
          </article>

          <article className="principle">
            <p className="principle__code">L7 — Minimum data</p>
            <h3 className="principle__title">Collect only what the process requires</h3>
            <p className="principle__desc">
              No immigration status, no health data, no HRIS sync, no government ID in v1.
              Attachments are process artifacts — an agenda, a signed minute — not evidence lockers.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section className="how-it-works" id="how-it-works" aria-labelledby="hiw-title" data-reveal>
      <div className="container">
        <div className="how-it-works__header">
          <p className="section-eyebrow">Session Model</p>
          <h2 className="section-title" id="hiw-title">From session open to destruction receipt</h2>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step__number"><span className="step__line"></span></div>
            <h3 className="step__title">Create session</h3>
            <p className="step__desc">
              Set a process title. Set the retention window. Invite parties by link and
              one-time code.
            </p>
          </div>
          <div className="step">
            <div className="step__number"><span className="step__line"></span></div>
            <h3 className="step__title">Live room</h3>
            <p className="step__desc">
              Avelis is a visible agent. It runs a named mediation move. Speech is delivered and
              dropped. Closing destroys the room.
            </p>
          </div>
          <div className="step">
            <div className="step__number"><span className="step__line"></span></div>
            <h3 className="step__title">Ledger and agenda</h3>
            <p className="step__desc">
              The facilitator writes process lines from a closed vocabulary. Agenda items
              are tabled, reordered, marked agreed, parked, or refused.
            </p>
          </div>
          <div className="step">
            <div className="step__number"><span className="step__line"></span></div>
            <h3 className="step__title">Joint minute initialing and export</h3>
            <p className="step__desc">
              The joint minute is optional. It is separate from the live room and may be exported or wiped.
              Parties may initial it as a process action. Exports are returned in response memory only; Avelis does not retain export files.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section className="threat-model" id="threat-model" aria-labelledby="tm-title" data-reveal>
      <div className="container">
        <div className="threat-model__grid">
          <div>
            <p className="section-eyebrow">Threat Model</p>
            <h2 className="section-title" id="tm-title">Built so room speech is not available to recover.</h2>
            <p className="section-desc">
              Closing ends room access and destroys the live room. Messages cannot be recovered.
              Process records and any joint minute are retained until the selected deadline, then destroyed.
            </p>
          </div>
          <ul className="threat-model__commitments" role="list">
            <li className="commitment">
              <svg className="commitment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
              </svg>
              <p className="commitment__text"><strong>Room messages are not stored by Avelis.</strong> They exist in memory only long enough to deliver.</p>
            </li>
            <li className="commitment">
              <svg className="commitment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
              </svg>
              <p className="commitment__text"><strong>Ledger and minutes are the only persisted bodies.</strong> Encrypted at rest.</p>
            </li>
            <li className="commitment">
              <svg className="commitment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
              </svg>
              <p className="commitment__text"><strong>No model writes the ledger.</strong> The process copilot does not read the room. No training on Avelis content.</p>
            </li>
            <li className="commitment">
              <svg className="commitment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
              </svg>
              <p className="commitment__text"><strong>Closed-room content cannot be recovered.</strong> Speech was not retained.</p>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section className="section" id="contact" aria-labelledby="contact-title" data-reveal>
      <div className="container">
        <div className="cta-form">
          <div className="cta-form__grid">
            <div className="cta-form__intro">
              <h2 id="contact-title">Request facilitator access</h2>
              <p>
                This form collects only what is needed to respond. No name, no phone, no
                company size, no job title. The product follows its own law: minimum data,
                retained only for the purpose stated.
              </p>
              <ul className="cta-form__principles" role="list">
                <li className="cta-form__principle">
                  <svg className="cta-form__principle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                  </svg>
                  Email is used only to respond to this request
                </li>
                <li className="cta-form__principle">
                  <svg className="cta-form__principle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                  </svg>
                  No name, phone, company, or job title collected
                </li>
                <li className="cta-form__principle">
                  <svg className="cta-form__principle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                  </svg>
                  Form follows product law L7: minimum data
                </li>
              </ul>
            </div>

            <div className="form-wrapper">
              {!isSuccess ? (
                <form className="form" id="access-form" aria-label="Request facilitator access form" onSubmit={handleAccessRequest}>
                  {formError && (
                    <div className="form__error-banner" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', border: '1px solid rgba(239, 68, 68, 0.2)' }} role="alert">
                      {formError}
                    </div>
                  )}
                  
                  <input type="text" name="bot_field" tabIndex={-1} autoComplete="off" style={{ display: 'none' }} aria-hidden="true" />
                  
                  <div className="form__field">
                    <label htmlFor="email" className="form__label">
                      Facilitator email <span className="form__label-required" aria-hidden="true">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      className="form__input"
                      placeholder="you@institution.org"
                      required
                      autoComplete="email"
                      aria-describedby="email-hint"
                    />
                    <p className="form__hint" id="email-hint">Used only to respond to this request.</p>
                    <p className="form__error-msg" id="email-error" role="alert">Enter a valid email address.</p>
                  </div>

                  <div className="form__field">
                    <label htmlFor="use-case" className="form__label">
                      What kind of facilitated talks do you run? <span className="form__hint" style={{ fontWeight: 400 }}>(optional)</span>
                    </label>
                    <textarea
                      id="use-case"
                      name="use-case"
                      className="form__textarea"
                      placeholder="e.g. university ombuds shuttle talks, Track 1.5 rounds, ADR panels..."
                      maxLength={500}
                      aria-describedby="use-case-hint"
                    ></textarea>
                    <p className="form__hint" id="use-case-hint">Max 500 characters. Do not include sensitive information.</p>
                  </div>

                  <div className="form__consent">
                    <input
                      type="checkbox"
                      id="consent"
                      name="consent"
                      className="form__checkbox"
                      required
                      aria-describedby="consent-error"
                    />
                    <label htmlFor="consent" className="form__consent-label">
                      I understand Avelis will use my email solely to respond to this request.
                      No name, phone, company, or job title is collected, per product law L7.
                    </label>
                  </div>
                  <p className="form__error-msg" id="consent-error" role="alert">Accept the minimum data terms to continue.</p>

                  <div className="form__privacy-note" role="note">
                    <svg className="form__privacy-note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8M8 9h2" />
                    </svg>
                    <p className="form__privacy-note-text">
                      <strong>Minimum data in practice.</strong> This form collects only your email and an
                      optional description — following product law L7. We do not collect your name, phone,
                      company, or job title at this stage.
                    </p>
                  </div>

                  <button type="submit" className="btn btn--primary btn--lg" style={{ width: '100%' }} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting…' : 'Request access'}
                  </button>
                </form>
              ) : (
                <div className="form__success" id="form-success" role="status" aria-live="polite" style={{ display: 'flex' }}>
                  <svg className="form__success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
                  </svg>
                  <h3 className="form__success-title">Request received</h3>
                  <p className="form__success-desc">
                    We will respond within two business days.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  </>
  );
}
