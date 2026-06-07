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
const capturePanel = document.getElementById('capture-panel');
const captureBtn = document.getElementById('capture-btn');

const youtubePlayer = new YouTubePlayerController('youtube-player');
const audioPitch = new AudioPitchController();

let currentVideoId = null;
let syncInterval = null;
let isLoading = false;
let usingCapture = false;

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
  if (loading) {
    pitchSlider.disabled = true;
    resetPitchBtn.disabled = true;
  }
}

function updatePitchDisplay(semitones) {
  pitchValue.textContent = formatPitch(semitones);
  pitchSlider.value = String(semitones);
}

function showCaptureFallback(show) {
  capturePanel.hidden = !show;
}

function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function startSync() {
  if (usingCapture) return;
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
  if (!usingCapture) audioPitch.seek(time);
  audioPitch.setPitch(getPitchSemitones());
  if (play) {
    if (usingCapture) await audioPitch.unpause();
    else await audioPitch.play();
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
      if (!usingCapture) audioPitch.seek(youtubePlayer.getCurrentTime());
      audioPitch.pause();
      break;
    case YT_ENDED:
      audioPitch.pause();
      if (!usingCapture) audioPitch.seek(0);
      stopSync();
      break;
    default:
      break;
  }
};

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
    return 'Falha de conexão com o servidor. Aguarde ~30s e tente de novo.';
  }
  return msg || 'Erro ao carregar.';
}

async function resolveAudioUrl(videoId) {
  setProgress(true, 15);
  setStatus('Buscando áudio (navegador)...', 'info');

  try {
    const { streamUrl } = await resolveInBrowser(videoId);
    setProgress(true, 45);
    setStatus('Preparando stream...', 'info');
    return await createProxyUrl(streamUrl);
  } catch {
    /* continua no servidor */
  }

  setProgress(true, 30);
  setStatus('Buscando áudio (servidor)...', 'info');

  const res = await fetch(apiUrl(`/api/resolve/${videoId}`));
  const data = await res.json().catch(() => ({}));

  if (res.ok) {
    if (data.audioUrl) return apiUrl(data.audioUrl);
    if (data.streamUrl) return createProxyUrl(data.streamUrl);
  }

  const err = new Error(data.error || 'Não foi possível extrair o áudio.');
  err.captureFallback = data.captureFallback !== false;
  throw err;
}

async function enableCaptureMode() {
  usingCapture = true;
  showCaptureFallback(false);
  setStatus('Selecione esta aba e marque "Compartilhar áudio da aba"...', 'info');

  youtubePlayer.unmute();

  await audioPitch.loadFromTabCapture();
  audioPitch.setPitch(getPitchSemitones());
  pitchSlider.disabled = false;
  resetPitchBtn.disabled = false;

  setStatus(
    'Captura ativa! Reproduza o vídeo e ajuste o tom. O áudio original da aba será processado em tempo real.',
    'success',
  );
}

async function loadVideo(url) {
  const videoId = extractVideoId(url);

  if (!videoId) {
    setStatus('URL inválida. Use um link do YouTube.', 'error');
    return;
  }

  setLoading(true);
  setProgress(true, 5);
  showCaptureFallback(false);
  usingCapture = false;

  try {
    if (currentVideoId !== videoId) {
      stopSync();
      audioPitch.stop();

      playerSection.hidden = false;
      pitchPanel.hidden = false;
      setStatus('Carregando vídeo...', 'info');

      const playerReady = youtubePlayer.load(videoId);

      try {
        const audioUrl = await resolveAudioUrl(videoId);
        await playerReady;
        youtubePlayer.enforceMute();

        await audioPitch.load(audioUrl);
        audioPitch.setPitch(getPitchSemitones());
        pitchSlider.disabled = false;
        resetPitchBtn.disabled = false;

        setStatus(
          'Pronto! Reproduza o vídeo e ajuste o tom com o slider — o áudio é processado em tempo real.',
          'success',
        );
      } catch (audioErr) {
        await playerReady;
        pitchSlider.disabled = true;
        resetPitchBtn.disabled = true;
        showCaptureFallback(true);
        setStatus(
          `${friendlyError(audioErr)} Use o botão abaixo para capturar o áudio da aba — funciona com qualquer vídeo que toca aqui.`,
          'error',
        );
      }

      currentVideoId = videoId;
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

captureBtn.addEventListener('click', async () => {
  if (isLoading) return;
  setLoading(true);
  try {
    await enableCaptureMode();
  } catch (err) {
    console.error(err);
    setStatus(friendlyError(err), 'error');
    showCaptureFallback(true);
  } finally {
    setLoading(false);
  }
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
showCaptureFallback(false);
