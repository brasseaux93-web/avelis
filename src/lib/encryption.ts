/**
 * Envelope crypto helpers + KMS factory re-exports.
 * Prefer getKms() for sign/verify/generateDataKey in server code.
 */
import crypto from 'node:crypto';
import { getKms, resetKmsForTests } from './kms/index';
import type { EnvelopeKey, KmsProvider } from './kms/types';

export type { EnvelopeKey, KmsProvider };
export { getKms, resetKmsForTests };

export const ENVELOPE_MARK = '_avelis_enc';

/**
 * @deprecated Prefer getKms() so provider selection (local|aws|vault) is honored.
 */
export const kms = {
  generateDataKey: (keyId: string) => getKms().generateDataKey(keyId),
  decryptDataKey: (keyId: string, ciphertext: Buffer) => getKms().decryptDataKey(keyId, ciphertext),
  sign: (keyId: string, digest: Buffer) => getKms().sign(keyId, digest),
  verify: (keyId: string, digest: Buffer, signature: Buffer) =>
    getKms().verify(keyId, digest, signature),
};

export function encrypt(
  plaintext: string,
  key: Buffer
): { ciphertext: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export type BodyEnvelope = {
  [ENVELOPE_MARK]: 1;
  alg: 'aes-256-gcm';
  keyId: string;
  wrappedKey: string;
  iv: string;
  tag: string;
  ct: string;
};

export function isBodyEnvelope(value: unknown): value is BodyEnvelope {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as BodyEnvelope)[ENVELOPE_MARK] === 1 &&
      (value as BodyEnvelope).alg === 'aes-256-gcm'
  );
}

function encryptionKeyId(): string {
  return (
    process.env.AWS_KMS_KEY_ID ||
    process.env.VAULT_TRANSIT_KEY ||
    process.env.LOCAL_DEV_ENCRYPTION_KEY ||
    'local-dev-encryption'
  );
}

/** Envelope-encrypt a JSON value. Digest the plaintext before calling this. */
export async function encryptJson(value: unknown, keyId = encryptionKeyId()): Promise<BodyEnvelope> {
  const dk = await getKms().generateDataKey(keyId);
  try {
    const { ciphertext, iv, authTag } = encrypt(JSON.stringify(value), dk.plaintext);
    return {
      [ENVELOPE_MARK]: 1,
      alg: 'aes-256-gcm',
      keyId,
      wrappedKey: dk.ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      ct: ciphertext.toString('base64'),
    };
  } finally {
    dk.plaintext.fill(0);
  }
}

export async function decryptJson(stored: unknown): Promise<unknown> {
  if (!isBodyEnvelope(stored)) return stored;
  const dk = await getKms().decryptDataKey(
    stored.keyId,
    Buffer.from(stored.wrappedKey, 'base64')
  );
  try {
    const text = decrypt(
      Buffer.from(stored.ct, 'base64'),
      dk,
      Buffer.from(stored.iv, 'base64'),
      Buffer.from(stored.tag, 'base64')
    );
    return JSON.parse(text) as unknown;
  } finally {
    dk.fill(0);
  }
}

export async function encryptText(plaintext: string, keyId = encryptionKeyId()): Promise<string> {
  return JSON.stringify(await encryptJson({ t: plaintext }, keyId));
}

export async function decryptText(stored: string): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    return stored;
  }
  const inner = (await decryptJson(parsed)) as { t?: string };
  return typeof inner?.t === 'string' ? inner.t : stored;
}
