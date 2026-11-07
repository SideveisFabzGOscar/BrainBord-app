import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Kryptering av sensitive dokumenter (sykemeldinger) på applikasjonsnivå
 * med AES-256-GCM, i tillegg til Supabase sin kryptering av lagring.
 * Nøkkelen ligger kun i servermiljøet (DOCUMENT_ENCRYPTION_KEY), aldri i databasen.
 */
function key(): Buffer {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!raw) throw new Error('DOCUMENT_ENCRYPTION_KEY mangler');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY må være 32 byte (base64)');
  return k;
}

export function encrypt(plain: Buffer): { iv: string; payload: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv: iv.toString('base64'), payload: Buffer.concat([enc, cipher.getAuthTag()]) };
}

export function decrypt(payload: Buffer, ivB64: string): Buffer {
  const tag = payload.subarray(payload.length - 16);
  const data = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Tillatte filtyper for dokumentasjon, sjekket mot filens faktiske innhold (magic bytes) */
export function detectMime(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}
