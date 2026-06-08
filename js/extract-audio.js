import { mediaProxyUrl } from './media.js';
import { resolveInBrowser } from './resolve-browser.js';

function buildAudioError(reason = '') {
  const r = reason.toLowerCase();
  if (r.includes('bot') || r.includes('login')) {
    return 'YouTube pediu verificação. Tente de novo em alguns segundos ou use a aba Arquivo MP3.';
  }
  if (
    r.includes('unavailable') ||
    r.includes('indisponível') ||
    r.includes('indisponivel') ||
    r.includes('não está disponível') ||
    r.includes('nao esta disponivel') ||
    r.includes('not available') ||
    r === 'error' ||
    r === 'unplayable'
  ) {
    return 'Este vídeo não está disponível no YouTube (removido, privado ou bloqueado).';
  }
  if (r.includes('age') || r.includes('idade')) {
    return 'Vídeo com restrição de idade — use a aba Arquivo MP3.';
  }
  if (r.includes('private') || r.includes('privad')) {
    return 'Este vídeo é privado ou restrito.';
  }
  return 'Não foi possível extrair o áudio. Tente outro vídeo ou envie um MP3.';
}

async function resolveFromServer(videoId) {
  const res = await fetch(`/api/resolve?id=${encodeURIComponent(videoId)}`);
  const data = await res.json().catch(() => ({}));

  if (res.ok && data.streamUrl) {
    return { streamUrl: data.streamUrl, mimeType: data.mimeType || 'audio/mp4' };
  }

  throw new Error(buildAudioError(data.reason || data.error || ''));
}

async function resolveStreamUrl(videoId) {
  try {
    const browser = await resolveInBrowser(videoId);
    if (browser?.streamUrl) return browser;
  } catch {
    /* continua no servidor */
  }

  return resolveFromServer(videoId);
}

/**
 * Resolve e baixa o áudio inteiro para um Blob local.
 */
export async function extractFromYouTube(videoId, onProgress) {
  onProgress?.(5);
  setStatusPhase(onProgress, 'Localizando áudio no seu dispositivo...', 10);

  const { streamUrl } = await resolveStreamUrl(videoId);

  onProgress?.(15);
  const proxyUrl = await mediaProxyUrl(streamUrl);
  return downloadAudioBlob(proxyUrl, onProgress);
}

function setStatusPhase(onProgress, _msg, pct) {
  onProgress?.(pct);
}

export async function downloadAudioBlob(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao baixar o áudio.');

  const total = Number(res.headers.get('content-length')) || 0;
  const type = res.headers.get('content-type') || 'audio/mp4';

  if (!res.body) {
    const blob = await res.blob();
    onProgress?.(100);
    return { blob, mimeType: type };
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) {
      const pct = total > 0 ? 15 + Math.round((loaded / total) * 84) : Math.min(95, 15 + loaded / 50000);
      onProgress(pct);
    }
  }

  onProgress?.(100);
  return { blob: new Blob(chunks, { type }), mimeType: type };
}
