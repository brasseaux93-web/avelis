/**
 * Destruction receipt PDF in the tab. Avelis does not keep the file.
 */
import { renderMinutePdfBytes } from './minutePdf';

export type ReceiptPdfInput = {
  sessionId: string;
  purgedAt: string;
  retentionWindow: string;
  bodiesDestroyed: string[];
  finalSequenceNumber: number;
  ledgerRootHash: string;
  destructionManifestDigest: string;
  valid: boolean | null;
};

export function renderReceiptPdfBytes(input: ReceiptPdfInput): Uint8Array {
  const body = [
    'Avelis destruction receipt',
    'Not a transcript. Speech was never stored.',
    '',
    `Session: ${input.sessionId}`,
    `Purged at: ${input.purgedAt}`,
    `Retention window: ${input.retentionWindow}`,
    `Bodies destroyed: ${input.bodiesDestroyed.join(', ')}`,
    `Final sequence: ${input.finalSequenceNumber}`,
    `Ledger root hash: ${input.ledgerRootHash}`,
    `Manifest digest: ${input.destructionManifestDigest}`,
    `Verify: ${input.valid == null ? 'not checked' : input.valid ? 'valid' : 'invalid'}`,
  ].join('\n');
  return renderMinutePdfBytes({
    title: 'Destruction receipt',
    status: 'attested',
    body,
    exportedAt: input.purgedAt,
  });
}

export function exportLeftNoTrace(): { localStorageKeys: string[] } {
  // Read-only audit that proves nothing was written to localStorage.
  // eslint-disable-next-line no-restricted-globals
  if (typeof localStorage === 'undefined') return { localStorageKeys: [] };
  // eslint-disable-next-line no-restricted-globals
  return { localStorageKeys: Object.keys(localStorage) };
}
