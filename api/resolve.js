const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
  { clientName: 'WEB', clientVersion: '2.20250217.01.00' },
];

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

  if (!res.ok) return null;

  const data = await res.json();
  if (data.playabilityStatus?.status !== 'OK') return null;

  const picked = pickDirectUrl(data.streamingData?.adaptiveFormats);
  if (!picked?.url) return null;

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
    for (const client of CLIENTS) {
      const result = await tryDirectInnertube(videoId, client);
      if (result) {
        res.status(200).json(result);
        return;
      }
    }

    const yt = await resolveWithYoutubei(videoId);
    if (yt) {
      res.status(200).json(yt);
      return;
    }

    res.status(500).json({ error: 'Não foi possível obter o áudio deste vídeo.' });
  } catch (err) {
    console.error('resolve:', err.message);
    res.status(500).json({ error: 'Erro ao resolver áudio.' });
  }
}
