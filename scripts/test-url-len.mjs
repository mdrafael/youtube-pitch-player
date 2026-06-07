const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLgcilh_Y_0jcqok';

const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    videoId: 'dQw4w9WgXcQ',
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 30,
        hl: 'pt',
        gl: 'BR',
      },
    },
  }),
});

const data = await res.json();
const f = (data.streamingData?.adaptiveFormats || [])
  .filter((x) => x.mimeType?.startsWith('audio/') && x.url)
  .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

const streamUrl = f.url;
const proxy = `/api/media?u=${encodeURIComponent(streamUrl)}`;
console.log('streamUrl len', streamUrl.length);
console.log('proxy len', proxy.length);
