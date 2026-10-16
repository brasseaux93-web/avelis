import crypto from 'node:crypto';

/**
 * Creates a canonical JSON string for hashing.
 * Sorts keys recursively.
 */
export function canonicalize(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') {
    return JSON.stringify(payload);
  }
  
  if (Array.isArray(payload)) {
    return '[' + payload.map(canonicalize).join(',') + ']';
  }
  
  const keys = Object.keys(payload).sort();
  let result = '{';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    result += JSON.stringify(key) + ':' + canonicalize(payload[key]);
    if (i < keys.length - 1) {
      result += ',';
    }
  }
  result += '}';
  return result;
}

/**
 * Computes the digest of a canonicalized payload.
 */
export function computePayloadDigest(payload: unknown): string {
  const canonicalStr = canonicalize(payload);
  return crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}

/**
 * Computes the line hash based on the previous line hash, sequence number, line type, payload digest, etc.
 */
export function computeLineHash(
  sessionId: string,
  sequenceNumber: number,
  lineType: string,
  payloadDigest: string,
  previousLineHash: string | null
): string {
  const data = [
    sessionId,
    sequenceNumber.toString(),
    lineType,
    payloadDigest,
    previousLineHash || 'genesis'
  ].join('|');
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
