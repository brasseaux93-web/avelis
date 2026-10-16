import type { KmsProvider } from './types';
import { LocalDevKms } from './localDevKms';
import { AwsKmsProvider } from './awsKms';
import { VaultKmsProvider } from './vaultKms';

export type { EnvelopeKey, KmsProvider, KmsProviderName } from './types';
export { LocalDevKms } from './localDevKms';
export { AwsKmsProvider } from './awsKms';
export { VaultKmsProvider } from './vaultKms';

let cached: KmsProvider | null = null;

const INSECURE = /not-for-production|change-me|placeholder|insecure|mock-key/i;

function looksInsecure(value: string | undefined): boolean {
  return Boolean(value && INSECURE.test(value));
}

export function getKms(): KmsProvider {
  if (cached) return cached;

  const provider = (process.env.KMS_PROVIDER || 'local').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';

  if (provider === 'aws') {
    cached = new AwsKmsProvider();
    return cached;
  }

  if (provider === 'vault') {
    cached = new VaultKmsProvider();
    return cached;
  }

  if (provider === 'local') {
    if (isProd) {
      throw new Error(
        'KMS_PROVIDER=local is forbidden when NODE_ENV=production. Set KMS_PROVIDER=aws|vault and the matching key ids.'
      );
    }
    cached = new LocalDevKms();
    return cached;
  }

  throw new Error(`Unknown KMS_PROVIDER=${provider}. Use local, aws, or vault.`);
}

export function resetKmsForTests(): void {
  cached = null;
}

/**
 * Production refuses the local stub, default mock secrets, and incomplete cloud config.
 */
export function assertProductionKms(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (looksInsecure(process.env.LOCAL_DEV_ENCRYPTION_KEY) || looksInsecure(process.env.LOCAL_DEV_SIGNING_KEY)) {
    throw new Error('Production refuses mock/insecure LOCAL_DEV_* keys.');
  }
  if (looksInsecure(process.env.JWT_SECRET) || looksInsecure(process.env.ROOM_SHARED_SECRET)) {
    throw new Error('Production refuses placeholder JWT_SECRET / ROOM_SHARED_SECRET.');
  }

  const provider = (process.env.KMS_PROVIDER || '').toLowerCase();
  if (provider === 'aws') {
    if (!process.env.AWS_KMS_KEY_ID) throw new Error('Production requires AWS_KMS_KEY_ID.');
    if (!process.env.AWS_KMS_SIGNING_KEY_ID) throw new Error('Production requires AWS_KMS_SIGNING_KEY_ID.');
    return;
  }
  if (provider === 'vault') {
    if (!process.env.VAULT_ADDR) throw new Error('Production requires VAULT_ADDR.');
    if (!process.env.VAULT_TOKEN) throw new Error('Production requires VAULT_TOKEN.');
    if (!process.env.VAULT_TRANSIT_KEY) throw new Error('Production requires VAULT_TRANSIT_KEY.');
    return;
  }
  throw new Error('Production requires KMS_PROVIDER=aws or KMS_PROVIDER=vault. The local stub is forbidden.');
}

export function securityHealthSnapshot(): {
  ok: boolean;
  kms: { provider: string; productionSafe: boolean };
  room: { isolation: 'ram'; persistedSpeech: false };
  subprocessors: { groq: string; speechStored: false };
} {
  const provider = (process.env.KMS_PROVIDER || 'local').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  let productionSafe: boolean;
  try {
    if (isProd) {
      assertProductionKms();
      productionSafe = true;
    } else {
      productionSafe = provider === 'aws' || provider === 'vault';
    }
  } catch {
    productionSafe = false;
  }
  return {
    ok: !isProd || productionSafe,
    kms: { provider, productionSafe },
    room: { isolation: 'ram', persistedSpeech: false },
    subprocessors: {
      groq: process.env.GROQ_API_KEY ? 'ram-window-while-open' : 'not-configured',
      speechStored: false,
    },
  };
}
