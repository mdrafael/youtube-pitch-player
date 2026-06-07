import { Innertube } from 'youtubei.js';

const CLIENTS = ['IOS', 'ANDROID', 'TV_EMBEDDED', 'WEB', 'MWEB'];

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

export async function resolveAudioStream(videoId) {
  const innertube = await Innertube.create();
  const errors = [];

  for (const client of CLIENTS) {
    try {
      const info = await innertube.getBasicInfo(videoId, { client });
      if (info.playability_status?.status !== 'OK') {
        errors.push(`${client}: ${info.playability_status?.reason || 'indisponível'}`);
        continue;
      }

      const format =
        info.chooseFormat({ type: 'audio', quality: 'best', format: 'mp4' }) ||
        info.chooseFormat({ type: 'audio', quality: 'best' });

      if (!format) {
        errors.push(`${client}: sem formato de áudio`);
        continue;
      }

      let streamUrl = format.url;
      if (!streamUrl) {
        streamUrl = await format.decipher(innertube.session.player);
      }

      if (streamUrl) {
        return { streamUrl, mimeType: format.mime_type || 'audio/mp4' };
      }
    } catch (err) {
      errors.push(`${client}: ${err.message?.slice(0, 80) || 'falha'}`);
    }
  }

  console.warn(`Resolve ${videoId}:`, errors.join(' | '));
  throw new Error(
    'Não foi possível obter o áudio deste vídeo. Verifique se o link é público e tente outro vídeo.',
  );
}
