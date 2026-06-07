import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkVideoEmbeddable } from './lib/check-video.js';
import { buildAudioError, extractVideoId, resolveAudioStream } from './lib/resolve-audio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

/** @type {Map<string, { url: string; expires: number }>} */
const streamSessions = new Map();

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json({ limit: '32kb' }));

function isAllowedStreamHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host.endsWith('.googlevideo.com') ||
    host === 'googlevideo.com' ||
    host.endsWith('.youtube.com') ||
    host.endsWith('.googleusercontent.com')
  );
}

function setCorsOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of streamSessions) {
    if (session.expires <= now) streamSessions.delete(id);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: 'multi-resolve',
    cookiesRequired: false,
  });
});

app.get('/api/check/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'URL ou ID de vídeo inválido.' });
  }

  const result = await checkVideoEmbeddable(videoId);
  res.json({ videoId, ...result });
});

app.get('/api/resolve/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'URL ou ID de vídeo inválido.' });
  }

  try {
    const result = await resolveAudioStream(videoId);

    if (result.audioPath) {
      return res.json({
        videoId,
        audioUrl: `/api/audio/${videoId}`,
        format: 'mp3',
        source: result.source,
        ready: true,
      });
    }

    res.json({
      streamUrl: result.streamUrl,
      mimeType: result.mimeType,
      source: result.source,
    });
  } catch (err) {
    console.error(`Resolve ${videoId}:`, err.message);
    res.status(500).json({
      error: err.message || buildAudioError(err.reason),
      reason: err.reason || '',
      captureFallback: true,
    });
  }
});

app.get('/api/audio/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  try {
    const result = await resolveAudioStream(videoId);
    if (!result.audioPath) {
      return res.status(404).json({ error: 'Áudio não disponível.' });
    }

    setCorsOrigin(req, res);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(result.audioPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxy/session', (req, res) => {
  const streamUrl = String(req.body?.streamUrl || '').trim();
  if (!streamUrl) {
    return res.status(400).json({ error: 'URL de stream ausente.' });
  }

  let parsed;
  try {
    parsed = new URL(streamUrl);
  } catch {
    return res.status(400).json({ error: 'URL de stream inválida.' });
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Protocolo não permitido.' });
  }

  if (!isAllowedStreamHost(parsed.hostname)) {
    return res.status(403).json({ error: 'Host de stream não permitido.' });
  }

  purgeExpiredSessions();

  const id = crypto.randomBytes(16).toString('hex');
  streamSessions.set(id, { url: streamUrl, expires: Date.now() + SESSION_TTL_MS });

  res.json({ proxyUrl: `/api/proxy/stream/${id}` });
});

app.get('/api/proxy/stream/:id', async (req, res) => {
  purgeExpiredSessions();

  const session = streamSessions.get(req.params.id);
  if (!session || session.expires <= Date.now()) {
    return res.status(404).json({ error: 'Sessão de stream expirada. Carregue o vídeo novamente.' });
  }

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  try {
    const upstream = await fetch(session.url, { headers, redirect: 'follow' });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: 'Falha ao buscar o stream de áudio.' });
    }

    setCorsOrigin(req, res);
    res.status(upstream.status);

    const passHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    for (const name of passHeaders) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!upstream.body) {
      return res.end();
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('Proxy stream:', err.message);
    res.status(502).json({ error: 'Erro ao transmitir o áudio.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor: http://localhost:${PORT}`);
});
