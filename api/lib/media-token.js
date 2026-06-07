import crypto from 'node:crypto';

const ALLOWED = ['googlevideo.com', 'youtube.com', 'googleusercontent.com'];
const SECRET = process.env.MEDIA_TOKEN_SECRET || 'youtube-pitch-player-v51';

function key() {
  return crypto.createHash('sha256').update(SECRET).digest();
}

export function isAllowedUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ALLOWED.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function seal(url) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function open(token) {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
