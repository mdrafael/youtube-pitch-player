const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'WEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
];

function pickAudioUrl(adaptiveFormats = []) {
  const audio = adaptiveFormats
    .filter((f) => f.mimeType?.startsWith('audio/') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const m4a = audio.find((f) => f.mimeType?.includes('mp4'));
  const best = m4a || audio[0];
  if (!best?.url) return null;
  return { streamUrl: best.url, mimeType: best.mimeType || 'audio/mp4' };
}

/**
 * Fallback: resolve áudio direto no navegador (rede do usuário).
 */
export async function resolveInBrowser(videoId) {
  const errors = [];

  for (const client of CLIENTS) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          context: {
            client: { ...client, hl: 'pt', gl: 'BR', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          },
        }),
      });

      if (!res.ok) {
        errors.push(`${client.clientName}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const status = data.playabilityStatus?.status;
      if (status !== 'OK') {
        errors.push(`${client.clientName}: ${data.playabilityStatus?.reason || status}`);
        continue;
      }

      const picked = pickAudioUrl(data.streamingData?.adaptiveFormats);
      if (picked) return picked;
      errors.push(`${client.clientName}: sem URL de áudio`);
    } catch (err) {
      errors.push(`${client.clientName}: ${err.message || 'falha'}`);
    }
  }

  console.warn('Browser resolve:', errors.join(' | '));
  throw new Error('browser-failed');
}
