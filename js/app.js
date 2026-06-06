import { extractVideoId, formatPitch } from './utils.js';
import { YouTubePlayerController } from './youtube-player.js';
import { AudioPitchController } from './audio-pitch.js';
import { apiUrl } from './config.js';

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

async function checkServer() {
  try {
    const res = await fetch(apiUrl('/api/health'));
    return res.ok;
  } catch {
    return false;
  }
}

async function prepareAudio(videoId) {
  setProgress(true, 15);
  setStatus('Preparando áudio para processamento... Aguarde um momento.', 'info');

  const res = await fetch(apiUrl(`/api/extract/${videoId}`), { method: 'POST' });

  setProgress(true, 90);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Não foi possível preparar o áudio do vídeo.');
  }

  const data = await res.json();
  setProgress(true, 100);
  return apiUrl(data.audioUrl);
}

async function loadVideo(url) {
  const videoId = extractVideoId(url);

  if (!videoId) {
    setStatus('URL inválida. Use um link do YouTube.', 'error');
    return;
  }

  const serverOk = await checkServer();
  if (!serverOk) {
    setStatus('Serviço de áudio indisponível no momento. Tente novamente em instantes.', 'error');
    return;
  }

  setLoading(true);
  setProgress(true, 5);

  try {
    if (currentVideoId !== videoId) {
      stopSync();
      audioPitch.stop();

      const audioUrl = await prepareAudio(videoId);

      setStatus('Carregando player...', 'info');
      playerSection.hidden = false;
      pitchPanel.hidden = false;

      await youtubePlayer.load(videoId);
      youtubePlayer.enforceMute();

      await audioPitch.load(audioUrl);
      audioPitch.setPitch(getPitchSemitones());

      currentVideoId = videoId;
      pitchSlider.disabled = false;
      resetPitchBtn.disabled = false;
    }

    setStatus(
      'Pronto! Reproduza o vídeo e ajuste o tom com o slider — o áudio é processado em tempo real.',
      'success',
    );
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Erro ao carregar.', 'error');
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

checkServer().then((ok) => {
  if (!ok) setStatus('Aguardando conexão com o serviço de áudio...', 'info');
});
