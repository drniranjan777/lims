import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { badRequest } from './errors';

/**
 * File storage behind a small interface so the local-disk implementation can be swapped for
 * S3-compatible object storage in production without touching callers.
 */
export interface StoredFile {
  storageKey: string;
  size: number;
  sha256: string;
}

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

export function assertAllowedMime(mime: string) {
  if (!ALLOWED_MIME.has(mime)) throw badRequest(`File type ${mime} is not allowed`);
}

function resolveKey(storageKey: string): string {
  const full = path.resolve(config.storageDir, storageKey);
  if (!full.startsWith(path.resolve(config.storageDir) + path.sep)) throw badRequest('Invalid storage key');
  return full;
}

export async function saveBuffer(buf: Buffer, ext: string): Promise<StoredFile> {
  const now = new Date();
  const safeExt = ext.replace(/[^a-z0-9.]/gi, '').slice(0, 10);
  const key = path.posix.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${crypto.randomUUID()}${safeExt}`,
  );
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf, { flag: 'wx' });
  return { storageKey: key, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

export async function readFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveKey(storageKey));
}

export async function removeFile(storageKey: string): Promise<void> {
  await fs.rm(resolveKey(storageKey), { force: true });
}
