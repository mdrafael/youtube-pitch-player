const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '19.45.4', deviceModel: 'iPhone16,2', osVersion: '17.5.1' },
  { clientName: 'ANDROID_VR', clientVersion: '1.57.29', deviceModel: 'Quest 3', androidSdkVersion: 32 },
  { clientName: 'MWEB', clientVersion: '2.20250217.01.00' },
  { clientName: 'TV_EMBEDDED', clientVersion: '2.0' },
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
      context: {
        client: {
          ...client,
          hl: navigator.language?.slice(0, 2) || 'pt',
          gl: 'BR',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!data || data.playabilityStatus?.status !== 'OK') return null;

  const picked = pickDirectUrl(data.streamingData?.adaptiveFormats);
  if (!picked?.url) return null;

  return { streamUrl: picked.url, mimeType: picked.mimeType || 'audio/mp4', source: client.clientName };
}

async function resolveWithYoutubeiWeb(videoId) {
  const { Innertube } = await import('youtubei.js/web');
  const innertube = await Innertube.create();

  for (const client of ['ANDROID', 'IOS', 'ANDROID_VR', 'MWEB', 'TV_EMBEDDED', 'WEB']) {
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
        return { streamUrl, mimeType: format.mime_type || 'audio/mp4', source: `yt-${client}` };
      }
    } catch {
      /* próximo */
    }
  }

  return null;
}

/** Resolve no navegador do usuário (IP residencial — evita bloqueio de bot). */
export async function resolveInBrowser(videoId) {
  for (const client of CLIENTS) {
    try {
      const result = await tryDirectInnertube(videoId, client);
      if (result) return result;
    } catch {
      /* próximo */
    }
  }

  return resolveWithYoutubeiWeb(videoId);
}
