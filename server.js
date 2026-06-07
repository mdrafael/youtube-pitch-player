import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ytDlpModule from 'yt-dlp-wrap';
import ffmpegPath from 'ffmpeg-static';

const YTDlpWrap = ytDlpModule.default ?? ytDlpModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const NODE_BIN = process.execPath;
const DENO_BIN = process.env.DENO_INSTALL
  ? path.join(process.env.DENO_INSTALL.replace(/\/$/, ''), 'bin', 'deno')
  : path.join(process.env.HOME || '', '.deno', 'bin', 'deno');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];
const AUDIO_DIR = path.join(__dirname, 'data', 'audio');
const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_BIN = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const COOKIES_FILE = path.join(BIN_DIR, 'youtube-cookies.txt');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Somente MP3 — iOS não reproduz WebM. */
const YTDLP_STRATEGIES = [
  {
    name: 'mp3/tv_embedded',
    mode: 'mp3',
    args: ['--extractor-args', 'youtube:player_client=tv_embedded,android_vr,tv_downgraded'],
  },
  {
    name: 'mp3/android',
    mode: 'mp3',
    args: ['--extractor-args', 'youtube:player_client=android,web'],
  },
  {
    name: 'mp3/ios',
    mode: 'mp3',
    args: ['--extractor-args', 'youtube:player_client=ios,mweb'],
  },
];

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

function toUserError(err, hasCookies) {
  const raw = String(err?.message || err || '');

  if (raw.includes('not a bot') || raw.includes('Sign in to confirm')) {
    if (!hasCookies) {
      return 'O YouTube bloqueou o servidor. O administrador precisa configurar YOUTUBE_COOKIES no Render.';
    }
    return 'O YouTube bloqueou temporariamente. Tente outro vídeo ou aguarde alguns minutos.';
  }
  if (raw.includes('Private video') || raw.includes('privado')) {
    return 'Este vídeo é privado ou restrito.';
  }
  if (raw.includes('Video unavailable') || raw.includes('indisponível')) {
    return 'Vídeo indisponível ou não encontrado.';
  }
  if (raw.includes('age-restricted') || raw.includes('confirm your age')) {
    return 'Este vídeo tem restrição de idade e não pode ser processado.';
  }

  return 'Não foi possível preparar o áudio do vídeo. Tente novamente.';
}

async function setupCookies() {
  const cookies = process.env.YOUTUBE_COOKIES?.trim();
  if (!cookies) return null;

  await mkdir(BIN_DIR, { recursive: true });
  await writeFile(COOKIES_FILE, cookies, 'utf8');
  console.log('Cookies do YouTube configurados.');
  return COOKIES_FILE;
}

async function ensureYtDlp() {
  await mkdir(BIN_DIR, { recursive: true });

  const isProduction = process.env.RENDER || process.env.NODE_ENV === 'production';
  if (isProduction && existsSync(YTDLP_BIN)) {
    await unlink(YTDLP_BIN).catch(() => {});
  }

  if (!existsSync(YTDLP_BIN)) {
    console.log('Baixando yt-dlp (versão mais recente)...');
    await YTDlpWrap.downloadFromGithub(YTDLP_BIN);
    console.log('yt-dlp pronto.');
  }
}

async function findAudioFile(videoId, { mp3Only = false } = {}) {
  const mp3Path = path.join(AUDIO_DIR, `${videoId}.mp3`);
  if (existsSync(mp3Path)) return mp3Path;

  if (mp3Only) return null;

  if (!existsSync(AUDIO_DIR)) return null;

  const files = await readdir(AUDIO_DIR);
  const match = files.find((f) => f.startsWith(videoId) && /\.(mp3|m4a|webm|opus)$/i.test(f));
  return match ? path.join(AUDIO_DIR, match) : null;
}

async function removeNonMp3Files(videoId) {
  if (!existsSync(AUDIO_DIR)) return;
  const files = await readdir(AUDIO_DIR);
  await Promise.all(
    files
      .filter((f) => f.startsWith(videoId) && !f.endsWith('.mp3'))
      .map((f) => unlink(path.join(AUDIO_DIR, f)).catch(() => {})),
  );
}

async function purgeLegacyAudioFormats() {
  if (!existsSync(AUDIO_DIR)) return;
  const files = await readdir(AUDIO_DIR);
  const legacy = files.filter((f) => /\.(webm|m4a|opus)$/i.test(f));
  if (legacy.length) {
    await Promise.all(legacy.map((f) => unlink(path.join(AUDIO_DIR, f)).catch(() => {})));
    console.log(`Cache legado removido: ${legacy.length} arquivo(s).`);
  }
}

function getJsRuntimeArgs() {
  if (existsSync(DENO_BIN)) {
    return ['--js-runtimes', `deno:${DENO_BIN}`];
  }
  return ['--js-runtimes', `node:${NODE_BIN}`];
}

function buildYtDlpArgs(videoId, outputTemplate, cookiesPath, strategy) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    url,
    '-o',
    outputTemplate,
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificates',
    '--user-agent',
    USER_AGENT,
    '--retries',
    '3',
    ...getJsRuntimeArgs(),
    '--remote-components',
    'ejs:github',
    ...strategy.args,
  ];

  args.push(
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '5',
    '--ffmpeg-location',
    ffmpegPath,
  );

  if (cookiesPath && existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
  }

  return args;
}

async function runYtDlp(videoId, strategy, cookiesPath) {
  const ytDlp = new YTDlpWrap(YTDLP_BIN);
  const outputTemplate = path.join(AUDIO_DIR, `${videoId}.%(ext)s`);
  const args = buildYtDlpArgs(videoId, outputTemplate, cookiesPath, strategy);

  console.log(`Processando ${videoId} [${strategy.name}]`);
  await ytDlp.execPromise(args);
}

async function extractAudioToMp3(videoId, { mp3Only = false } = {}) {
  let existing = await findAudioFile(videoId, { mp3Only });
  if (existing) return existing;

  if (mp3Only) {
    await removeNonMp3Files(videoId);
  }

  await ensureYtDlp();
  await mkdir(AUDIO_DIR, { recursive: true });

  const cookiesPath = await setupCookies();
  const hasCookies = !!(cookiesPath && existsSync(cookiesPath));
  const errors = [];

  for (const strategy of YTDLP_STRATEGIES) {
    try {
      await runYtDlp(videoId, strategy, cookiesPath);
      const audioPath = await findAudioFile(videoId, { mp3Only });
      if (audioPath) {
        console.log(`Áudio pronto: ${videoId} (${path.extname(audioPath)})`);
        return audioPath;
      }
    } catch (err) {
      errors.push(`${strategy.name}: ${err.message?.slice(0, 120)}`);
      console.warn(`Falha [${strategy.name}]:`, err.message?.slice(0, 200));
    }
  }

  const lastError = new Error(errors.join(' | ') || 'Todas as estratégias falharam.');
  lastError.userMessage = toUserError(lastError, hasCookies);
  throw lastError;
}

function getOrCreateExtraction(videoId, options = {}) {
  const { mp3Only = false } = options;
  const key = mp3Only ? `${videoId}:mp3` : videoId;
  if (!extractionJobs.has(key)) {
    const job = extractAudioToMp3(videoId, { mp3Only }).finally(() => {
      extractionJobs.delete(key);
    });
    extractionJobs.set(key, job);
  }
  return extractionJobs.get(key);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, node: NODE_BIN });
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
    processing: extractionJobs.has(videoId),
  });
});

app.post('/api/extract/:videoId', async (req, res) => {
  try {
    const videoId = extractVideoId(req.params.videoId);
    if (!videoId) {
      return res.status(400).json({ error: 'URL ou ID de vídeo inválido.' });
    }

    const audioPath = await getOrCreateExtraction(videoId, { mp3Only: true });
    res.json({
      videoId,
      audioUrl: `/api/audio/${videoId}`,
      format: 'mp3',
      ready: true,
    });
  } catch (err) {
    console.error('Erro no processamento:', err.message);
    res.status(500).json({
      error: err.userMessage || toUserError(err, !!process.env.YOUTUBE_COOKIES),
    });
  }
});

app.get('/api/audio/:videoId', async (req, res) => {
  const videoId = extractVideoId(req.params.videoId);
  if (!videoId) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  let filePath = await findAudioFile(videoId, { mp3Only: true });

  if (!filePath) {
    filePath = await getOrCreateExtraction(videoId, { mp3Only: true });
  }

  if (!filePath) {
    return res.status(404).json({ error: 'Áudio ainda não disponível para processamento.' });
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext !== '.mp3') {
    return res.status(415).json({ error: 'Formato de áudio incompatível com este dispositivo.' });
  }
  const mime =
    ext === '.mp3' ? 'audio/mpeg' : ext === '.webm' ? 'audio/webm' : 'audio/mp4';

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

app.listen(PORT, async () => {
  await mkdir(AUDIO_DIR, { recursive: true });
  await purgeLegacyAudioFormats();
  await setupCookies();
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`Node: ${NODE_BIN}`);
});
