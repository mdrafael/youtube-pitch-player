import { defineConfig } from 'vite';

const ALLOWED_HOSTS = ['googlevideo.com', 'youtube.com', 'googleusercontent.com'];

function isAllowedUrl(raw) {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Proxy /yt-media em dev (em produção o Service Worker faz isso). */
function ytMediaDevProxy() {
  return {
    name: 'yt-media-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/yt-media', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const target = url.searchParams.get('u');

        if (!target || !isAllowedUrl(target)) {
          res.statusCode = 400;
          res.end('URL inválida');
          return;
        }

        const headers = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        };
        if (req.headers.range) headers.Range = req.headers.range;

        try {
          const upstream = await fetch(target, { headers, redirect: 'follow' });
          res.statusCode = upstream.status;
          for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
            const value = upstream.headers.get(name);
            if (value) res.setHeader(name, value);
          }
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch (err) {
          res.statusCode = 502;
          res.end(err.message);
        }
      });
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [ytMediaDevProxy()],
  optimizeDeps: {
    include: ['@soundtouchjs/audio-worklet'],
  },
  server: {
    port: 5173,
  },
});
