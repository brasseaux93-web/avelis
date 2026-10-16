import { describe, expect, test } from 'vitest';
import { dotStuff, isSafeEmailAddress, sanitizeHeaderValue } from '../../src/lib/email';

describe('SMTP header injection hardening', () => {
  test('accepts ordinary addresses', () => {
    expect(isSafeEmailAddress('party@example.org')).toBe(true);
    expect(isSafeEmailAddress('a.b+tag@sub.example.co')).toBe(true);
  });

  test('rejects CR/LF and SMTP command smuggling', () => {
    expect(isSafeEmailAddress('victim@example.org\r\nRCPT TO:<x@evil.test>')).toBe(false);
    expect(isSafeEmailAddress('victim@example.org\nBcc: x@evil.test')).toBe(false);
    expect(isSafeEmailAddress('a@b.org>\r\nDATA')).toBe(false);
    expect(isSafeEmailAddress('<a@b.org>')).toBe(false);
  });

  test('rejects malformed or non-string input', () => {
    expect(isSafeEmailAddress('no-at-sign')).toBe(false);
    expect(isSafeEmailAddress('a@b')).toBe(false);
    expect(isSafeEmailAddress(undefined)).toBe(false);
    expect(isSafeEmailAddress('x'.repeat(250) + '@b.org')).toBe(false);
  });

  test('header values lose CR/LF', () => {
    const v = sanitizeHeaderValue('Session\r\nBcc: x@evil.test');
    expect(v).not.toMatch(/[\r\n]/);
  });

  test('body lines starting with "." are dot-stuffed', () => {
    expect(dotStuff('hi\r\n.\r\nQUIT')).toBe('hi\r\n..\r\nQUIT');
  });
});
