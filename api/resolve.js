const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
  { clientName: 'WEB', clientVersion: '2.20250217.01.00' },
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
  return 'Não foi possível obter o áudio deste vídeo.';
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
      context: { client: { ...client, hl: 'pt', gl: 'BR' } },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!data) return { error: 'resposta inválida' };

  if (data.playabilityStatus?.status !== 'OK') {
    return { error: data.playabilityStatus?.reason || data.playabilityStatus?.status || '' };
  }

  const picked = pickDirectUrl(data.streamingData?.adaptiveFormats);
  if (!picked?.url) return { error: 'sem formato de áudio' };

  return { streamUrl: picked.url, mimeType: picked.mimeType || 'audio/mp4', source: client.clientName };
}

async function resolveWithYoutubei(videoId) {
  const { Innertube } = await import('youtubei.js');
  const innertube = await Innertube.create();

  for (const client of ['ANDROID', 'IOS', 'TV_EMBEDDED', 'WEB', 'MWEB']) {
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
        return { streamUrl, mimeType: format.mime_type || 'audio/mp4', source: client };
      }
    } catch {
      /* próximo */
    }
  }

  return null;
}

export default async function handler(req, res) {
  const videoId = String(req.query?.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let lastReason = '';

    for (const client of CLIENTS) {
      const result = await tryDirectInnertube(videoId, client);
      if (result?.streamUrl) {
        res.status(200).json(result);
        return;
      }
      if (result?.error) lastReason = result.error;
    }

    const yt = await resolveWithYoutubei(videoId);
    if (yt) {
      res.status(200).json(yt);
      return;
    }

    res.status(500).json({
      error: buildAudioError(lastReason),
      reason: lastReason,
    });
  } catch (err) {
    console.error('resolve:', err.message);
    res.status(500).json({ error: 'Erro ao resolver áudio.' });
  }
}
