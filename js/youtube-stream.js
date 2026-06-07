const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
];

function buildAudioError(reason = '') {
  const r = reason.toLowerCase();
  if (
    r.includes('unavailable') ||
    r.includes('indisponível') ||
    r.includes('indisponivel') ||
    r.includes('não está disponível') ||
    r.includes('nao esta disponivel') ||
    r.includes('not available') ||
    r === 'error'
  ) {
    return 'Este vídeo não está disponível no YouTube (removido, privado ou bloqueado). Tente outro link.';
  }
  if (r.includes('age') || r.includes('idade')) {
    return 'Este vídeo tem restrição de idade e não pode ser processado automaticamente.';
  }
  if (r.includes('private') || r.includes('privad')) {
    return 'Este vídeo é privado ou restrito.';
  }
  if (r.includes('copyright') || r.includes('direitos')) {
    return 'Este vídeo tem restrição de direitos autorais na sua região.';
  }
  return 'Não foi possível obter o áudio. Tente outro vídeo ou aguarde alguns segundos e recarregue a página.';
}

function pickDirectUrl(adaptiveFormats = []) {
  const audio = adaptiveFormats
    .filter((f) => f.mimeType?.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const m4a = audio.find((f) => f.mimeType?.includes('mp4'));
  return m4a || audio[0] || null;
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

  const data = await res.json().catch(() => null);
  if (!data) return { error: 'resposta inválida' };

  if (data.playabilityStatus?.status !== 'OK') {
    return { error: data.playabilityStatus?.reason || data.playabilityStatus?.status || '' };
  }

  const picked = pickDirectUrl(data.streamingData?.adaptiveFormats);
  if (!picked?.url) return { error: 'sem formato de áudio' };

  return { streamUrl: picked.url, mimeType: picked.mimeType || 'audio/mp4' };
}

async function resolveFromServer(videoId) {
  const res = await fetch(`/api/resolve?id=${encodeURIComponent(videoId)}`);
  const data = await res.json().catch(() => ({}));

  if (res.ok && data.streamUrl) {
    return { streamUrl: data.streamUrl, mimeType: data.mimeType || 'audio/mp4' };
  }

  throw new Error(buildAudioError(data.reason || data.error || ''));
}

async function resolveInBrowser(videoId) {
  let lastReason = '';

  for (const client of CLIENTS) {
    try {
      const result = await tryDirectInnertube(videoId, client);
      if (result?.streamUrl) return result;
      if (result?.error) lastReason = result.error;
    } catch {
      /* próximo */
    }
  }

  throw new Error(buildAudioError(lastReason));
}

export async function resolveStream(videoId) {
  try {
    return await resolveFromServer(videoId);
  } catch (serverErr) {
    if (serverErr?.message && !serverErr.message.includes('Failed to fetch')) {
      throw serverErr;
    }
  }

  return resolveInBrowser(videoId);
}
