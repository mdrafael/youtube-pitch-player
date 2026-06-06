import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
import { isIOS } from './utils.js';

/**
 * Reproduz áudio com pitch em tempo real via Web Audio + SoundTouch.
 */
export class AudioPitchController {
  constructor() {
    this.audioContext = null;
    this.audioElement = null;
    this.sourceNode = null;
    this.pitchNode = null;
    this.gainNode = null;
    this.semitones = 0;
    this.isReady = false;
    this._registerPromise = null;
    this._blobUrl = null;
  }

  async init() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();

    if (!this._registerPromise) {
      this._registerPromise = SoundTouchNode.register(this.audioContext, processorUrl);
    }
    await this._registerPromise;

    this.audioElement = document.createElement('audio');
    this.audioElement.preload = 'auto';
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preservesPitch = false;
    this.audioElement.setAttribute('playsinline', '');
    this.audioElement.setAttribute('webkit-playsinline', '');

    this.pitchNode = new SoundTouchNode({ context: this.audioContext });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1;

    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.sourceNode.connect(this.pitchNode);
    this.pitchNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.pitchNode.playbackRate.value = 1;
    this.setPitch(0);
  }

  _revokeBlob() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  }

  async _resolveAudioSrc(audioUrl) {
    if (!isIOS()) {
      return audioUrl;
    }

    const res = await fetch(audioUrl);
    if (!res.ok) {
      throw new Error('Erro ao carregar o arquivo de áudio.');
    }

    const blob = await res.blob();
    const type = res.headers.get('content-type') || 'audio/mpeg';
    this._revokeBlob();
    this._blobUrl = URL.createObjectURL(new Blob([blob], { type }));
    return this._blobUrl;
  }

  /**
   * @param {string} audioUrl
   */
  async load(audioUrl) {
    await this.init();
    this.stop();

    const src = await this._resolveAudioSrc(audioUrl);
    this.audioElement.src = src;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Tempo esgotado ao carregar o áudio.'));
      }, isIOS() ? 180000 : 120000);

      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Erro ao carregar o arquivo de áudio.'));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        for (const ev of readyEvents) {
          this.audioElement.removeEventListener(ev, onReady);
        }
        this.audioElement.removeEventListener('error', onError);
      };

      const readyEvents = ['loadedmetadata', 'canplay', 'canplaythrough'];
      for (const ev of readyEvents) {
        this.audioElement.addEventListener(ev, onReady, { once: true });
      }
      this.audioElement.addEventListener('error', onError, { once: true });
      this.audioElement.load();
    });

    await this.resumeContext();
    this.isReady = true;
  }

  async resumeContext() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  setPitch(semitones) {
    this.semitones = semitones;
    if (!this.pitchNode || !this.audioContext) return;

    const time = this.audioContext.currentTime;
    this.pitchNode.pitch.setValueAtTime(1, time);
    this.pitchNode.pitchSemitones.setValueAtTime(semitones, time);
    this.pitchNode.playbackRate.setValueAtTime(1, time);
  }

  async play() {
    if (!this.audioElement || !this.isReady) return;
    await this.resumeContext();
    this.setPitch(this.semitones);
    try {
      await this.audioElement.play();
    } catch (err) {
      console.warn('Play bloqueado:', err);
    }
  }

  pause() {
    this.audioElement?.pause();
  }

  seek(seconds) {
    if (!this.audioElement || !Number.isFinite(seconds)) return;
    try {
      this.audioElement.currentTime = Math.max(0, seconds);
    } catch {
      /* ignore */
    }
  }

  getCurrentTime() {
    return this.audioElement?.currentTime ?? 0;
  }

  getDuration() {
    const d = this.audioElement?.duration;
    return Number.isFinite(d) ? d : 0;
  }

  isPlaying() {
    return this.audioElement ? !this.audioElement.paused : false;
  }

  stop() {
    if (!this.audioElement) return;
    this.audioElement.pause();
    this.audioElement.removeAttribute('src');
    this.audioElement.load();
    this._revokeBlob();
    this.isReady = false;
  }

  destroy() {
    this.stop();
    this.sourceNode?.disconnect();
    this.pitchNode?.disconnect();
    this.gainNode?.disconnect();
    this.audioContext?.close();
    this.audioContext = null;
    this.audioElement = null;
    this.sourceNode = null;
    this.pitchNode = null;
    this.gainNode = null;
    this._registerPromise = null;
  }
}
