export async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Seu navegador não suporta Service Worker. Use Chrome, Safari ou Firefox atualizado.');
  }

  let reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }

  await navigator.serviceWorker.ready;
  return reg;
}

export function mediaProxyUrl(streamUrl) {
  return `/yt-media?u=${encodeURIComponent(streamUrl)}`;
}
