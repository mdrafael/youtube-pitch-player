import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ytDlpModule from 'yt-dlp-wrap';
import ffmpegPath from 'ffmpeg-static';

const YTDlpWrap = ytDlpModule.default ?? ytDlpModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];
const AUDIO_DIR = path.join(__dirname, 'data', 'audio');
const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_BIN = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

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
app.use(express.json());

/** @type {Map<string, Promise<string>>} */
const extractionJobs = new Map();

function extractVideoId(input) {
  const trimmed = String(input).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function ensureYtDlp() {
  await mkdir(BIN_DIR, { recursive: true });
  if (!existsSync(YTDLP_BIN)) {
    console.log('Baixando yt-dlp (primeira execução)...');
    await YTDlpWrap.downloadFromGithub(YTDLP_BIN);
    console.log('yt-dlp pronto.');
  }
}

async function findAudioFile(videoId) {
  const mp3Path = path.join(AUDIO_DIR, `${videoId}.mp3`);
  if (existsSync(mp3Path)) return mp3Path;

  if (!existsSync(AUDIO_DIR)) return null;

  const files = await readdir(AUDIO_DIR);
  const match = files.find((f) => f.startsWith(videoId) && /\.(mp3|m4a|webm|opus)$/i.test(f));
  return match ? path.join(AUDIO_DIR, match) : null;
}

async function extractAudioToMp3(videoId) {
  const existing = await findAudioFile(videoId);
  if (existing) return existing;

  await ensureYtDlp();
  await mkdir(AUDIO_DIR, { recursive: true });

  const ytDlp = new YTDlpWrap(YTDLP_BIN);
  const outputTemplate = path.join(AUDIO_DIR, `${videoId}.%(ext)s`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  console.log(`Extraindo áudio: ${videoId}`);

  await ytDlp.execPromise([
    url,
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '5',
    '-o',
    outputTemplate,
    '--no-playlist',
    '--no-warnings',
    '--ffmpeg-location',
    ffmpegPath,
  ]);

  const audioPath = await findAudioFile(videoId);
  if (!audioPath) {
    throw new Error('Áudio não disponível para processamento.');
  }

  console.log(`Áudio salvo: ${audioPath}`);
  return audioPath;
}

function getOrCreateExtraction(videoId) {
  if (!extractionJobs.has(videoId)) {
    const job = extractAudioToMp3(videoId).finally(() => {
      extractionJobs.delete(videoId);
    });
    extractionJobs.set(videoId, job);
  }
  return extractionJobs.get(videoId);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/status/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  const file = await findAudioFile(videoId);
  res.json({
    videoId,
    ready: !!file,
    extracting: extractionJobs.has(videoId),
  });
});

app.post('/api/extract/:videoId', async (req, res) => {
  try {
    const videoId = extractVideoId(req.params.videoId);
    if (!videoId) {
      return res.status(400).json({ error: 'URL ou ID de vídeo inválido.' });
    }

    const audioPath = await getOrCreateExtraction(videoId);
    res.json({
      videoId,
      audioUrl: `/api/audio/${videoId}`,
      ready: true,
    });
  } catch (err) {
    console.error('Erro na extração:', err);
    res.status(500).json({
      error: err.message || 'Não foi possível preparar o áudio do vídeo.',
    });
  }
});

app.get('/api/audio/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  const filePath = await findAudioFile(videoId);
  if (!filePath) {
    return res.status(404).json({ error: 'Áudio ainda não disponível para processamento.' });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

app.listen(PORT, async () => {
  await mkdir(AUDIO_DIR, { recursive: true });
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`Áudios em: ${AUDIO_DIR}`);
});
