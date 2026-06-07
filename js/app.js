import { extractVideoId, formatPitch, formatTime } from './utils.js';
import { AudioPitchController } from './audio-pitch.js';
import { extractFromYouTube } from './extract-audio.js';
import { cleanupLegacyServiceWorker } from './sw-cleanup.js';

const ytForm = document.getElementById('yt-form');
const fileForm = document.getElementById('file-form');
const urlInput = document.getElementById('video-url');
const fileInput = document.getElementById('audio-file');
const extractBtn = document.getElementById('extract-btn');
const btnText = extractBtn.querySelector('.btn-text');
const btnSpinner = extractBtn.querySelector('.btn-spinner');
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');
const playerSection = document.getElementById('player-section');
const pitchSlider = document.getElementById('pitch-slider');
const pitchValue = document.getElementById('pitch-value');
const resetPitchBtn = document.getElementById('reset-pitch-btn');
const playBtn = document.getElementById('play-btn');
const seekSlider = document.getElementById('seek-slider');
const timeDisplay = document.getElementById('time-display');
const tabYt = document.getElementById('tab-yt');
const tabFile = document.getElementById('tab-file');
const panelYt = document.getElementById('panel-yt');
const panelFile = document.getElementById('panel-file');

const audioPitch = new AudioPitchController();
let isLoading = false;
let seekInterval = null;

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
  extractBtn.disabled = loading;
  fileInput.disabled = loading;
  btnText.hidden = loading;
  btnSpinner.hidden = !loading;
  pitchSlider.disabled = loading;
  resetPitchBtn.disabled = loading;
  playBtn.disabled = loading;
}

function updatePitchDisplay(semitones) {
  pitchValue.textContent = formatPitch(semitones);
  pitchSlider.value = String(semitones);
}

function updateTimeDisplay() {
  const cur = audioPitch.getCurrentTime();
  const dur = audioPitch.getDuration();
  timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
  if (dur > 0) seekSlider.value = String((cur / dur) * 1000);
}

function startSeekSync() {
  stopSeekSync();
  seekInterval = setInterval(() => {
    if (!audioPitch.isReady) return;
    updateTimeDisplay();
    playBtn.textContent = audioPitch.isPlaying() ? '⏸ Pausar' : '▶ Tocar';
  }, 250);
}

function stopSeekSync() {
  if (seekInterval) {
    clearInterval(seekInterval);
    seekInterval = null;
  }
}

async function loadBlob(blob) {
  playerSection.hidden = false;
  setStatus('Preparando áudio...', 'info');
  await audioPitch.loadBlob(blob);
  audioPitch.setPitch(parseFloat(pitchSlider.value) || 0);
  pitchSlider.disabled = false;
  resetPitchBtn.disabled = false;
  playBtn.disabled = false;
  seekSlider.disabled = false;
  updateTimeDisplay();
  startSeekSync();
  setStatus('Áudio pronto! Ajuste o tom e pressione Tocar.', 'success');
}

async function extractYouTube(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    setStatus('URL inválida. Cole um link do YouTube.', 'error');
    return;
  }

  setLoading(true);
  setProgress(true, 0);
  setStatus('Extraindo áudio do YouTube...', 'info');

  try {
    stopSeekSync();
    audioPitch.stop();

    const { blob } = await extractFromYouTube(videoId, (pct) => {
      setProgress(true, pct);
      if (pct < 100) setStatus(`Baixando áudio... ${pct}%`, 'info');
    });

    await loadBlob(blob);
  } catch (err) {
    console.error(err);
    const msg =
      err?.message === 'Failed to fetch'
        ? 'Falha de rede. Verifique sua conexão.'
        : err?.message || 'Erro ao extrair.';
    setStatus(msg, 'error');
  } finally {
    setLoading(false);
    setTimeout(() => setProgress(false), 800);
  }
}

async function loadFile(file) {
  if (!file) return;

  const ok = /^audio\//.test(file.type) || /\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i.test(file.name);
  if (!ok) {
    setStatus('Envie um arquivo de áudio (MP3, M4A, WAV, etc.).', 'error');
    return;
  }

  setLoading(true);
  setProgress(true, 50);
  setStatus('Carregando arquivo...', 'info');

  try {
    stopSeekSync();
    audioPitch.stop();
    await loadBlob(file);
    setProgress(true, 100);
  } catch (err) {
    console.error(err);
    setStatus(err?.message || 'Erro ao carregar arquivo.', 'error');
  } finally {
    setLoading(false);
    setTimeout(() => setProgress(false), 800);
  }
}

function switchTab(tab) {
  const isYt = tab === 'yt';
  tabYt.classList.toggle('active', isYt);
  tabFile.classList.toggle('active', !isYt);
  tabYt.setAttribute('aria-selected', String(isYt));
  tabFile.setAttribute('aria-selected', String(!isYt));
  panelYt.hidden = !isYt;
  panelFile.hidden = isYt;
}

ytForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isLoading) return;
  extractYouTube(urlInput.value);
});

fileForm.addEventListener('change', (e) => {
  if (isLoading) return;
  const file = e.target.files?.[0];
  if (file) loadFile(file);
});

tabYt.addEventListener('click', () => switchTab('yt'));
tabFile.addEventListener('click', () => switchTab('file'));

playBtn.addEventListener('click', async () => {
  await audioPitch.resumeContext();
  await audioPitch.togglePlay();
  playBtn.textContent = audioPitch.isPlaying() ? '⏸ Pausar' : '▶ Tocar';
});

seekSlider.addEventListener('input', () => {
  const dur = audioPitch.getDuration();
  if (dur > 0) audioPitch.seek((parseFloat(seekSlider.value) / 1000) * dur);
  updateTimeDisplay();
});

pitchSlider.addEventListener('input', async () => {
  await audioPitch.resumeContext();
  const semitones = parseFloat(pitchSlider.value) || 0;
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
playBtn.disabled = true;
seekSlider.disabled = true;
updatePitchDisplay(0);
cleanupLegacyServiceWorker();
