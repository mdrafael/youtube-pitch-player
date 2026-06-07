import { Innertube } from 'youtubei.js';

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
    return 'Este vídeo tem restrição de idade. O YouTube não libera o áudio para processamento externo.';
  }
  if (r.includes('private') || r.includes('privad')) {
    return 'Este vídeo é privado ou restrito. Use um link público.';
  }
  if (r.includes('copyright') || r.includes('direitos') || r.includes('music')) {
    return 'Este vídeo tem bloqueio de direitos autorais para extração de áudio.';
  }
  if (r.includes('unavailable') || r.includes('indispon') || r.includes('not available')) {
    return 'O YouTube marcou este vídeo como indisponível para extração de áudio — mesmo que apareça no site. Teste o link em aba anônima ou tente outro vídeo.';
  }
  return 'Não foi possível obter o áudio. O YouTube pode bloquear clipes musicais, vídeos regionais ou com restrições. Tente outro link.';
}

export async function resolveAudioStream(videoId) {
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
  const err = new Error(buildAudioError(lastReason));
  err.reason = lastReason;
  throw err;
}
