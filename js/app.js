import { extractVideoId, formatPitch } from './utils.js';
import { YouTubePlayerController } from './youtube-player.js';
import { AudioPitchController } from './audio-pitch.js';
import { apiUrl } from './config.js';
import { resolveInBrowser } from './innertube-browser.js';

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_ENDED = 0;

const form = document.getElementById('load-form');
const urlInput = document.getElementById('video-url');
const loadBtn = document.getElementById('load-btn');
const btnText = loadBtn.querySelector('.btn-text');
const btnSpinner = loadBtn.querySelector('.btn-spinner');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const playerSection = document.getElementById('player-section');
const pitchPanel = document.getElementById('pitch-panel');
const pitchSlider = document.getElementById('pitch-slider');
const pitchValue = document.getElementById('pitch-value');
const resetPitchBtn = document.getElementById('reset-pitch-btn');

const youtubePlayer = new YouTubePlayerController('youtube-player');
const audioPitch = new AudioPitchController();

let currentVideoId = null;
let syncInterval = null;
let isLoading = false;

function getPitchSemitones() {
  return parseFloat(pitchSlider.value) || 0;
}

function setStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

function setProgress(visible, percent = 0) {
  progressBar.hidden = !visible;
  progressBar.value = percent;
}

function setLoading(loading) {
  isLoading = loading;
  loadBtn.disabled = loading;
  btnText.hidden = loading;
  btnSpinner.hidden = !loading;
  pitchSlider.disabled = loading;
  resetPitchBtn.disabled = loading;
}

function updatePitchDisplay(semitones) {
  pitchValue.textContent = formatPitch(semitones);
  pitchSlider.value = String(semitones);
}

function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function startSync() {
  stopSync();
  syncInterval = setInterval(() => {
    if (!currentVideoId) return;
    const ytTime = youtubePlayer.getCurrentTime();
    const audioTime = audioPitch.getCurrentTime();
    if (Math.abs(ytTime - audioTime) > 0.35) {
      audioPitch.seek(ytTime);
    }
  }, 1000);
}

async function syncAudioToVideo(play = false) {
  const time = youtubePlayer.getCurrentTime();
  audioPitch.seek(time);
  audioPitch.setPitch(getPitchSemitones());
  if (play) {
    await audioPitch.play();
    startSync();
  }
}

youtubePlayer.onStateChange = async (state) => {
  if (!audioPitch.isReady) return;

  switch (state) {
    case YT_PLAYING:
      await syncAudioToVideo(true);
      break;
    case YT_PAUSED:
      audioPitch.pause();
      stopSync();
      break;
    case YT_BUFFERING:
      audioPitch.seek(youtubePlayer.getCurrentTime());
      audioPitch.pause();
      break;
    case YT_ENDED:
      audioPitch.pause();
      audioPitch.seek(0);
      stopSync();
      break;
    default:
      break;
  }
};

async function checkProxy() {
  try {
    const res = await fetch(apiUrl('/api/health'));
    return res.ok;
  } catch {
    return false;
  }
}

async function createProxyUrl(streamUrl) {
  const res = await fetch(apiUrl('/api/proxy/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ streamUrl }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível preparar o proxy de áudio.');
  }

  const data = await res.json();
  return apiUrl(data.proxyUrl);
}

function friendlyError(err) {
  const msg = err?.message || '';
  if (msg === 'Failed to fetch') {
    return 'Falha de conexão com o servidor. O Render pode estar iniciando — aguarde ~30s e tente de novo.';
  }
  if (msg === 'browser-failed') {
    return 'O YouTube não liberou o áudio deste vídeo (comum em clipes musicais ou com restrição regional). Teste o link em aba anônima ou use outro vídeo.';
  }
  return msg || 'Erro ao carregar.';
}

async function resolveStreamUrl(videoId) {
  let serverError = '';

  try {
    const res = await fetch(apiUrl(`/api/resolve/${videoId}`));
    if (res.ok) {
      const data = await res.json();
      return data.streamUrl;
    }
    const data = await res.json().catch(() => ({}));
    serverError = data.error || '';
  } catch {
    /* tenta fallback no navegador */
  }

  setProgress(true, 35);
  setStatus('Tentando localizar áudio pelo seu navegador...', 'info');

  try {
    const { streamUrl } = await resolveInBrowser(videoId);
    return streamUrl;
  } catch {
    if (serverError) throw new Error(serverError);
    throw new Error('browser-failed');
  }
}

async function prepareAudio(videoId) {
  setProgress(true, 20);
  setStatus('Localizando áudio do vídeo...', 'info');

  const streamUrl = await resolveStreamUrl(videoId);

  setProgress(true, 55);
  setStatus('Preparando reprodução com processamento de tom...', 'info');

  const audioUrl = await createProxyUrl(streamUrl);

  setProgress(true, 100);
  return audioUrl;
}

async function checkVideo(videoId) {
  try {
    const res = await fetch(apiUrl(`/api/check/${videoId}`));
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function loadVideo(url) {
  const videoId = extractVideoId(url);

  if (!videoId) {
    setStatus('URL inválida. Use um link do YouTube.', 'error');
    return;
  }

  setLoading(true);
  setProgress(true, 5);

  try {
    if (currentVideoId !== videoId) {
      stopSync();
      audioPitch.stop();

      const embedCheck = await checkVideo(videoId);
      if (embedCheck && !embedCheck.ok) {
        throw new Error(embedCheck.message);
      }

      playerSection.hidden = false;
      pitchPanel.hidden = false;
      setStatus('Carregando vídeo...', 'info');

      const playerReady = youtubePlayer.load(videoId).then(() => youtubePlayer.enforceMute());

      let audioOk = true;
      try {
        const audioUrl = await prepareAudio(videoId);
        await playerReady;
        await audioPitch.load(audioUrl);
        audioPitch.setPitch(getPitchSemitones());
        pitchSlider.disabled = false;
        resetPitchBtn.disabled = false;
      } catch (audioErr) {
        audioOk = false;
        await playerReady;
        pitchSlider.disabled = true;
        resetPitchBtn.disabled = true;
        console.error(audioErr);
        setStatus(
          `${friendlyError(audioErr)} O vídeo foi carregado abaixo, mas o controle de tom não funciona neste link.`,
          'error',
        );
      }

      currentVideoId = videoId;

      if (audioOk) {
        setStatus(
          'Pronto! Reproduza o vídeo e ajuste o tom com o slider — o áudio é processado em tempo real.',
          'success',
        );
      }
    }
  } catch (err) {
    console.error(err);
    setStatus(friendlyError(err), 'error');
  } finally {
    setLoading(false);
    setTimeout(() => setProgress(false), 600);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isLoading) return;
  loadVideo(urlInput.value);
});

pitchSlider.addEventListener('input', async () => {
  await audioPitch.resumeContext();
  const semitones = getPitchSemitones();
  audioPitch.setPitch(semitones);
  updatePitchDisplay(semitones);
});

resetPitchBtn.addEventListener('click', () => {
  pitchSlider.value = '0';
  audioPitch.setPitch(0);
  updatePitchDisplay(0);
});

pitchSlider.disabled = true;
resetPitchBtn.disabled = true;
updatePitchDisplay(0);

checkProxy().then((ok) => {
  if (!ok) setStatus('Aguardando conexão com o serviço de áudio...', 'info');
});
