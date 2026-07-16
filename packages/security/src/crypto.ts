import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for provider credentials.
 *
 * Each secret gets its own random data-encryption key (DEK). The DEK encrypts
 * the plaintext with AES-256-GCM; the master key (KEK, from APP_ENCRYPTION_KEY)
 * encrypts the DEK. Rotating the master key only requires re-wrapping DEKs,
 * not re-encrypting payloads.
 *
 * The output is a single opaque string safe to store in Postgres. It never
 * contains the plaintext or the master key.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface EncryptedEnvelope {
  v: 1;
  /** Identifier of the master key used to wrap the DEK (for rotation). */
  kek: string;
  /** DEK wrapped by the master key: iv.tag.ciphertext, base64. */
  dek: string;
  /** Payload encrypted by the DEK: iv.tag.ciphertext, base64. */
  data: string;
}

function parseMasterKey(masterKeyBase64: string): Buffer {
  const key = Buffer.from(masterKeyBase64, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      'APP_ENCRYPTION_KEY must decode to exactly 32 bytes (use: openssl rand -base64 32)',
    );
  }
  return key;
}

function sealWithKey(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

function openWithKey(key: Buffer, sealed: string): Buffer {
  const [ivB64, tagB64, dataB64] = sealed.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed sealed value');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
}

/** Encrypt a secret. Returns an opaque JSON envelope string. */
export function encryptSecret(
  plaintext: string,
  masterKeyBase64: string,
  kekId = 'primary',
): string {
  const masterKey = parseMasterKey(masterKeyBase64);
  const dek = randomBytes(KEY_BYTES);
  const envelope: EncryptedEnvelope = {
    v: 1,
    kek: kekId,
    dek: sealWithKey(masterKey, dek),
    data: sealWithKey(dek, Buffer.from(plaintext, 'utf8')),
  };
  return JSON.stringify(envelope);
}

/** Decrypt a secret envelope produced by {@link encryptSecret}. */
export function decryptSecret(envelopeJson: string, masterKeyBase64: string): string {
  const masterKey = parseMasterKey(masterKeyBase64);
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(envelopeJson) as EncryptedEnvelope;
  } catch {
    throw new Error('Malformed secret envelope');
  }
  if (envelope.v !== 1) throw new Error(`Unsupported envelope version: ${String(envelope.v)}`);
  const dek = openWithKey(masterKey, envelope.dek);
  return openWithKey(dek, envelope.data).toString('utf8');
}

/**
 * Non-reversible display fingerprint for a stored secret. Safe to show in the
 * UI ("Connected · fp 3f9a01c2") because the underlying tokens are
 * high-entropy. Never derives from low-entropy input like passwords.
 */
export function secretFingerprint(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 8);
}

/** Generate a high-entropy random token (base64url). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
