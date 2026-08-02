import { createHash } from 'crypto'

/**
 * Encrypts an API key using AES-256-GCM with the PULSE_KEY_ENCRYPTION_KEY
 * env variable. Returns an armored string: "v1:<iv_hex>:<ciphertext_hex>:<tag_hex>"
 * that can be stored in the database and decrypted later by the worker.
 *
 * The same key MUST be set in the worker environment, otherwise encrypted
 * keys are unrecoverable.
 */
const ALGORITHM = 'aes-256-gcm'

export async function encrypt(plaintext: string): Promise<string> {
  const key = process.env.PULSE_KEY_ENCRYPTION_KEY
  if (!key) {
    throw new Error('PULSE_KEY_ENCRYPTION_KEY is not set')
  }

  // Derive a 32-byte key from the env password (which can be any length)
  const derived = createHash('sha256').update(key).digest()

  const { randomBytes, createCipheriv } = await import('crypto')
  const iv = randomBytes(12)  // 96-bit IV for GCM

  const cipher = createCipheriv(ALGORITHM, derived, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Armored format: v1:iv:ciphertext:authTag
  return `v1:${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

/**
 * Decrypts an armored string back to plaintext. Used by the polling worker
 * to fetch spend data from the provider on the user's behalf.
 */
export async function decrypt(armored: string): Promise<string> {
  const key = process.env.PULSE_KEY_ENCRYPTION_KEY
  if (!key) {
    throw new Error('PULSE_KEY_ENCRYPTION_KEY is not set')
  }

  const derived = createHash('sha256').update(key).digest()

  const parts = armored.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Unrecognized encrypted key format')
  }

  const iv = Buffer.from(parts[1], 'hex')
  const ciphertext = Buffer.from(parts[2], 'hex')
  const tag = Buffer.from(parts[3], 'hex')

  const { createDecipheriv } = await import('crypto')
  const decipher = createDecipheriv(ALGORITHM, derived, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Creates a non-reversible fingerprint for display purposes: "sk-...abcd"
 * This lets the UI show the user WHICH key without exposing the key itself.
 * Format: first 5 chars + '...' + last 4 chars of the SHA-256 hash.
 */
export function fingerprint(apiKey: string): string {
  const hash = createHash('sha256').update(apiKey).digest('hex')
  const prefix = apiKey.slice(0, 5)
  const suffix = hash.slice(-4)
  return `${prefix}...${suffix}`
}
