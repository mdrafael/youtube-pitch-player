import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isAllowedUrl, open } from './lib/media-token.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let target = req.query?.u;

  if (req.query?.t) {
    target = open(String(req.query.t));
  }

  if (!target || typeof target !== 'string' || !isAllowedUrl(target)) {
    res.status(400).json({ error: 'URL inválida.' });
    return;
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' });

    res.status(upstream.status);

    for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    console.error('media proxy:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Falha ao buscar áudio.' });
    }
  }
}
