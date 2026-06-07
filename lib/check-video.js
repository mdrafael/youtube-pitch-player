export async function checkVideoEmbeddable(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YouTubePitchPlayer/1.0)' },
    });

    if (res.ok) {
      const data = await res.json();
      return { ok: true, title: data.title || '' };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        reason: 'restricted',
        message: 'Este vídeo é privado ou restrito para incorporação.',
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        reason: 'not_found',
        message:
          'O YouTube não encontrou este vídeo como público/incorporável. Pode estar privado, excluído ou o link estar incorreto — abra em aba anônima para confirmar.',
      };
    }

    return {
      ok: false,
      reason: 'unknown',
      message: 'Não foi possível verificar o vídeo no YouTube.',
    };
  } catch {
    return { ok: true, title: '' };
  }
}
