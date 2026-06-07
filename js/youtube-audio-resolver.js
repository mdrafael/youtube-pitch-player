const CLIENTS = ['IOS', 'ANDROID', 'TV_EMBEDDED', 'WEB', 'MWEB'];

/**
 * Obtém URL de áudio direto do YouTube no navegador do usuário.
 * Usa a rede/IP do visitante — sem cookies no servidor.
 */
export async function resolveAudioStream(videoId) {
  const { Innertube } = await import('youtubei.js/web');
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

  console.warn('Resolução de áudio:', errors.join(' | '));
  throw new Error(
    'Não foi possível obter o áudio deste vídeo. Verifique se o link é público e tente outro vídeo.',
  );
}
