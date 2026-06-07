import { isAllowedUrl, seal } from './lib/media-token.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const streamUrl = String(body?.streamUrl || '').trim();

  if (!streamUrl || !isAllowedUrl(streamUrl)) {
    res.status(400).json({ error: 'URL inválida.' });
    return;
  }

  res.status(200).json({ token: seal(streamUrl) });
}
