const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'WEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
];

function pickFormat(adaptiveFormats = []) {
  const audio = adaptiveFormats
    .filter((f) => f.mimeType?.startsWith('audio/'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const m4a = audio.find((f) => f.mimeType?.includes('mp4') && f.url);
  if (m4a) return { url: m4a.url, mimeType: m4a.mimeType };

  const withUrl = audio.find((f) => f.url);
  if (withUrl) return { url: withUrl.url, mimeType: withUrl.mimeType };

  const ciphered = audio.find((f) => f.signatureCipher || f.cipher);
  if (ciphered) return { ciphered, mimeType: ciphered.mimeType };

  return null;
}

async function tryDirectInnertube(videoId, client) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          ...client,
          hl: navigator.language?.slice(0, 2) || 'pt',
          gl: 'BR',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (data.playabilityStatus?.status !== 'OK') return null;

  const picked = pickFormat(data.streamingData?.adaptiveFormats);
  if (!picked) return null;

  if (picked.url) return { streamUrl: picked.url, mimeType: picked.mimeType };

  return { needsDecipher: true, format: picked.ciphered, mimeType: picked.mimeType };
}

async function resolveWithYoutubei(videoId) {
  const { Innertube } = await import('youtubei.js/web');
  const innertube = await Innertube.create();

  for (const client of ['IOS', 'ANDROID', 'MWEB', 'WEB', 'TV_EMBEDDED']) {
    try {
      const info = await innertube.getBasicInfo(videoId, { client });
      if (info.playability_status?.status !== 'OK') continue;

      const format =
        info.chooseFormat({ type: 'audio', quality: 'best', format: 'mp4' }) ||
        info.chooseFormat({ type: 'audio', quality: 'best' });

      if (!format) continue;

      let streamUrl = format.url;
      if (!streamUrl) {
        streamUrl = await format.decipher(innertube.session.player);
      }

      if (streamUrl) {
        return { streamUrl, mimeType: format.mime_type || 'audio/mp4' };
      }
    } catch {
      /* próximo cliente */
    }
  }

  return null;
}

/**
 * Resolve stream de áudio no dispositivo do usuário (sem servidor).
 */
export async function resolveStream(videoId) {
  const errors = [];

  for (const client of CLIENTS) {
    try {
      const result = await tryDirectInnertube(videoId, client);
      if (!result) {
        errors.push(`${client.clientName}: indisponível`);
        continue;
      }
      if (result.streamUrl) {
        return { streamUrl: result.streamUrl, mimeType: result.mimeType };
      }
    } catch (err) {
      errors.push(`${client.clientName}: ${err.message?.slice(0, 60)}`);
    }
  }

  try {
    const ytResult = await resolveWithYoutubei(videoId);
    if (ytResult) return ytResult;
  } catch (err) {
    errors.push(`youtubei: ${err.message?.slice(0, 60)}`);
  }

  console.warn('Stream resolve:', errors.join(' | '));
  throw new Error(
    'Não foi possível obter o áudio deste vídeo. Tente outro link ou abra o vídeo em aba anônima para confirmar se é público.',
  );
}
