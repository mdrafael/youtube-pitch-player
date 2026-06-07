import { Innertube } from 'youtubei.js';
import { getOrExtract } from './ytdlp-extract.js';

const CLIENTS = ['IOS', 'ANDROID', 'TV_EMBEDDED', 'WEB', 'MWEB', 'ANDROID_VR', 'WEB_EMBEDDED'];

export function extractVideoId(input) {
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

export function buildAudioError(reason = '') {
  const r = reason.toLowerCase();
  if (r.includes('age') || r.includes('idade')) {
    return 'Este vídeo tem restrição de idade. Use o modo captura de áudio abaixo.';
  }
  if (r.includes('private') || r.includes('privad')) {
    return 'Este vídeo é privado ou restrito.';
  }
  return 'Não foi possível extrair o áudio automaticamente. Use o botão "Capturar áudio da aba" abaixo.';
}

async function resolveWithYoutubei(videoId) {
  const innertube = await Innertube.create();
  const errors = [];
  let lastReason = '';

  for (const client of CLIENTS) {
    try {
      const info = await innertube.getBasicInfo(videoId, { client });
      const status = info.playability_status?.status;
      const reason = info.playability_status?.reason || '';

      if (status !== 'OK') {
        lastReason = reason || status || 'indisponível';
        errors.push(`${client}: ${lastReason}`);
        continue;
      }

      const format =
        info.chooseFormat({ type: 'audio', quality: 'best', format: 'mp4' }) ||
        info.chooseFormat({ type: 'audio', quality: 'best' });

      if (!format) {
        errors.push(`${client}: sem formato`);
        continue;
      }

      let streamUrl = format.url;
      if (!streamUrl) {
        streamUrl = await format.decipher(innertube.session.player);
      }

      if (streamUrl) {
        return { streamUrl, mimeType: format.mime_type || 'audio/mp4', source: 'youtubei' };
      }
    } catch (err) {
      errors.push(`${client}: ${err.message?.slice(0, 80) || 'falha'}`);
    }
  }

  console.warn(`youtubei ${videoId}:`, errors.join(' | '));
  const err = new Error(buildAudioError(lastReason));
  err.reason = lastReason;
  throw err;
}

export async function resolveAudioStream(videoId) {
  try {
    return await resolveWithYoutubei(videoId);
  } catch (youtubeiErr) {
    const file = await getOrExtract(videoId);
    if (file) {
      return { audioPath: file, mimeType: 'audio/mpeg', source: 'ytdlp' };
    }
    throw youtubeiErr;
  }
}
