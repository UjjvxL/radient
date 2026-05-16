/**
 * Radient — Encrypted Token Store
 * AES-256-GCM encryption for Spotify tokens at rest.
 */
import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const key = config.encryption.key;
  if (!key || key.length !== 64) {
    // #region agent log
    fetch('http://127.0.0.1:7885/ingest/5d3b2723-a535-4ccc-ab6a-c8f61aeb268b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'08e7ba'},body:JSON.stringify({sessionId:'08e7ba',runId:'baseline',hypothesisId:'H4',location:'src/auth/token-store.ts:13',message:'Invalid encryption key format',data:{hasKey:!!key,keyLength:key?.length||0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, tagHex, data] = encrypted.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let dec = decipher.update(data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}
