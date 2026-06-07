import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ytDlpModule from 'yt-dlp-wrap';
import ffmpegPath from 'ffmpeg-static';

const YTDlpWrap = ytDlpModule.default ?? ytDlpModule;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'data', 'audio');
const BIN_DIR = path.join(ROOT, 'bin');
const YTDLP_BIN = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const NODE_BIN = process.execPath;
const DENO_BIN = path.join(process.env.HOME || '', '.deno', 'bin', 'deno');

const STRATEGIES = [
  { name: 'ios', args: ['--extractor-args', 'youtube:player_client=ios,mweb'] },
  { name: 'android', args: ['--extractor-args', 'youtube:player_client=android,web'] },
  { name: 'tv', args: ['--extractor-args', 'youtube:player_client=tv_embedded,android_vr'] },
];

/** @type {Map<string, Promise<string|null>>} */
const jobs = new Map();

async function ensureYtDlp() {
  await mkdir(BIN_DIR, { recursive: true });
  if (!existsSync(YTDLP_BIN)) {
    await YTDlpWrap.downloadFromGithub(YTDLP_BIN);
  }
}

function jsRuntimeArgs() {
  if (existsSync(DENO_BIN)) return ['--js-runtimes', `deno:${DENO_BIN}`];
  return ['--js-runtimes', `node:${NODE_BIN}`];
}

async function findMp3(videoId) {
  const mp3 = path.join(AUDIO_DIR, `${videoId}.mp3`);
  return existsSync(mp3) ? mp3 : null;
}

export async function extractWithYtDlp(videoId) {
  const cached = await findMp3(videoId);
  if (cached) return cached;

  await ensureYtDlp();
  await mkdir(AUDIO_DIR, { recursive: true });

  const ytDlp = new YTDlpWrap(YTDLP_BIN);
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const errors = [];

  for (const strategy of STRATEGIES) {
    try {
      await ytDlp.execPromise([
        url,
        '-o',
        path.join(AUDIO_DIR, `${videoId}.%(ext)s`),
        '--no-playlist',
        '--no-warnings',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '--ffmpeg-location',
        ffmpegPath,
        ...jsRuntimeArgs(),
        '--remote-components',
        'ejs:github',
        ...strategy.args,
      ]);

      const file = await findMp3(videoId);
      if (file) return file;
    } catch (err) {
      errors.push(`${strategy.name}: ${err.message?.slice(0, 100)}`);
    }
  }

  const files = existsSync(AUDIO_DIR) ? await readdir(AUDIO_DIR) : [];
  await Promise.all(
    files.filter((f) => f.startsWith(videoId) && !f.endsWith('.mp3')).map((f) => unlink(path.join(AUDIO_DIR, f)).catch(() => {})),
  );

  console.warn(`yt-dlp ${videoId}:`, errors.join(' | '));
  return null;
}

export function getOrExtract(videoId) {
  if (!jobs.has(videoId)) {
    jobs.set(
      videoId,
      extractWithYtDlp(videoId).finally(() => jobs.delete(videoId)),
    );
  }
  return jobs.get(videoId);
}
