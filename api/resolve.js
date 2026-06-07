import { Innertube } from 'youtubei.js';

const CLIENTS = ['ANDROID', 'IOS', 'TV_EMBEDDED', 'WEB', 'MWEB'];

export default async function handler(req, res) {
  const videoId = String(req.query?.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const innertube = await Innertube.create();

    for (const client of CLIENTS) {
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
          res.status(200).json({
            streamUrl,
            mimeType: format.mime_type || 'audio/mp4',
            source: client,
          });
          return;
        }
      } catch {
        /* próximo */
      }
    }

    res.status(500).json({ error: 'Não foi possível obter o áudio deste vídeo.' });
  } catch (err) {
    console.error('resolve:', err.message);
    res.status(500).json({ error: 'Erro ao resolver áudio.' });
  }
}
