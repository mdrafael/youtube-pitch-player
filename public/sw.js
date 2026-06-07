const ALLOWED_HOSTS = ['googlevideo.com', 'youtube.com', 'googleusercontent.com'];

function isAllowedUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname !== '/yt-media') return;

  const target = url.searchParams.get('u');
  if (!target || !isAllowedUrl(target)) {
    event.respondWith(new Response('URL inválida', { status: 400 }));
    return;
  }

  event.respondWith(proxyMedia(event.request, target));
});

async function proxyMedia(request, target) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  const range = request.headers.get('range');
  if (range) headers.Range = range;

  const response = await fetch(target, { headers, redirect: 'follow' });

  const outHeaders = new Headers();
  const pass = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
  for (const name of pass) {
    const value = response.headers.get(name);
    if (value) outHeaders.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
