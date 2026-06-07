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

async function proxyMedia(target, req, res) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const upstream = await fetch(target, { headers, redirect: 'follow' });
  res.statusCode = upstream.status;
  for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

function devApiPlugin() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/session', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        try {
          const { default: handler } = await import('./api/session.js');
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', async () => {
            await handler(
              { method: req.method, body: body ? JSON.parse(body) : {}, headers: req.headers },
              {
                status(code) { res.statusCode = code; return this; },
                json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); },
                setHeader(k, v) { res.setHeader(k, v); },
                end() { res.end(); },
              },
            );
          });
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      server.middlewares.use('/api/media', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        let target = url.searchParams.get('u');

        if (url.searchParams.get('t')) {
          const { open } = await import('./api/lib/media-token.js');
          target = open(url.searchParams.get('t'));
        }

        if (!target || !isAllowedUrl(target)) {
          res.statusCode = 400;
          res.end('URL inválida');
          return;
        }
        try {
          await proxyMedia(target, req, res);
        } catch (err) {
          res.statusCode = 502;
          res.end(err.message);
        }
      });

      server.middlewares.use('/api/resolve', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('id');
        try {
          const { default: handler } = await import('./api/resolve.js');
          await handler({ query: { id }, headers: {} }, {
            status(code) { res.statusCode = code; return this; },
            json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); },
            setHeader(k, v) { res.setHeader(k, v); },
          });
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [devApiPlugin()],
  optimizeDeps: {
    include: ['@soundtouchjs/audio-worklet'],
  },
  server: {
    port: 5173,
  },
});
