/**
 * Optional SMTP invite delivery. Zero new dependencies.
 * When SMTP_HOST/SMTP_FROM unset, callers use copy-link only.
 * Never log invite codes or full email addresses (domain only).
 */
import net from 'node:net';
import tls from 'node:tls';

export type EmailDeliveryResult =
  | { ok: true; channel: 'email' }
  | { ok: false; channel: 'copy_link'; reason: 'not_configured' | 'send_failed' };

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export function emailDomainOnly(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 0) return 'unknown';
  return address.slice(at + 1).toLowerCase() || 'unknown';
}

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Strict address check: no CR/LF/control chars, no angle brackets, sane length. */
export function isSafeEmailAddress(address: unknown): address is string {
  if (typeof address !== 'string') return false;
  if (address.length === 0 || address.length > 254) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f<>]/.test(address)) return false;
  return EMAIL_RE.test(address);
}

/** Remove CR/LF and other control characters from a header value (prevents header injection). */
export function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]+/g, ' ').trim();
}

/** SMTP transparency (RFC 5321 4.5.2): lines beginning with '.' get an extra '.'. */
export function dotStuff(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');
}

export type InviteEmailArgs = {
  to: string;
  inviteCode: string;
  joinUrl: string;
  sessionTitle: string;
};

/** Minimal SMTP send. Prefer copy-link when not configured. */
export async function sendInviteEmail(args: InviteEmailArgs): Promise<EmailDeliveryResult> {
  if (!emailConfigured()) {
    return { ok: false, channel: 'copy_link', reason: 'not_configured' };
  }

  if (!isSafeEmailAddress(args.to) || !isSafeEmailAddress(process.env.SMTP_FROM)) {
    return { ok: false, channel: 'copy_link', reason: 'send_failed' };
  }

  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM!;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const subject = sanitizeHeaderValue(`Avelis session invite: ${args.sessionTitle}`);
  const body = [
    'You have been invited to an Avelis facilitated session.',
    '',
    `Join path: ${sanitizeHeaderValue(args.joinUrl)}`,
    `One-time invite code: ${sanitizeHeaderValue(args.inviteCode)}`,
    '',
    'Room messages are delivered live and are not stored by Avelis.',
    'This code is single-use. Parties have no standing accounts.',
  ].join('\r\n');

  try {
    await smtpSend({ host, port, secure, user, pass, from, to: args.to, subject, body });
    return { ok: true, channel: 'email' };
  } catch {
    return { ok: false, channel: 'copy_link', reason: 'send_failed' };
  }
}

type SmtpOpts = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  body: string;
};

function smtpSend(opts: SmtpOpts): Promise<void> {
  if (!isSafeEmailAddress(opts.to) || !isSafeEmailAddress(opts.from)) {
    return Promise.reject(new Error('smtp_invalid_address'));
  }
  return new Promise((resolve, reject) => {
    const socket: net.Socket = opts.secure
      ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
      : net.connect({ host: opts.host, port: opts.port });

    let buffer = '';
    let step = 0;
    let settled = false;
    const timeout = setTimeout(() => fail(new Error('smtp_timeout')), 15000);

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(err);
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.end();
      resolve();
    };
    const write = (line: string) => socket.write(line + '\r\n');

    socket.setEncoding('utf8');
    socket.on('error', (err) => fail(err instanceof Error ? err : new Error('smtp_error')));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || '';
      for (const line of parts) {
        if (!/^\d{3}/.test(line)) continue;
        const code = Number(line.slice(0, 3));
        if (step === 0 && code === 220) {
          write('EHLO avelis.local');
          step = 1;
        } else if (step === 1 && code === 250) {
          if (opts.user) {
            write('AUTH LOGIN');
            step = 2;
          } else {
            write(`MAIL FROM:<${opts.from}>`);
            step = 4;
          }
        } else if (step === 2 && code === 334) {
          write(Buffer.from(opts.user, 'utf8').toString('base64'));
          step = 3;
        } else if (step === 3 && code === 334) {
          write(Buffer.from(opts.pass, 'utf8').toString('base64'));
          step = 31;
        } else if (step === 31 && (code === 235 || code === 250)) {
          write(`MAIL FROM:<${opts.from}>`);
          step = 4;
        } else if (step === 4 && code === 250) {
          write(`RCPT TO:<${opts.to}>`);
          step = 5;
        } else if (step === 5 && (code === 250 || code === 251)) {
          write('DATA');
          step = 6;
        } else if (step === 6 && code === 354) {
          write(
            [
              `From: ${opts.from}`,
              `To: ${opts.to}`,
              `Subject: ${sanitizeHeaderValue(opts.subject)}`,
              'MIME-Version: 1.0',
              'Content-Type: text/plain; charset=utf-8',
              '',
              dotStuff(opts.body),
              '.',
            ].join('\r\n')
          );
          step = 7;
        } else if (step === 7 && code === 250) {
          write('QUIT');
          ok();
        } else if (code >= 400) {
          fail(new Error(`smtp_${code}`));
        }
      }
    });
  });
}
