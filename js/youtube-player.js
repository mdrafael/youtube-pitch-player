/**
 * Wrapper para a YouTube IFrame Player API (vídeo mudo — som vem do áudio processado).
 */
export class YouTubePlayerController {
  constructor(containerId) {
    this.containerId = containerId;
    this.player = null;
    this.videoId = null;
    this.onStateChange = null;
  }

  static waitForAPI() {
    if (window.YT?.Player) return Promise.resolve();

    return new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
    });
  }

  enforceMute() {
    if (!this.player?.mute) return;
    try {
      this.player.mute();
      this.player.setVolume?.(0);
    } catch {
      /* ignore */
    }
  }

  unmute() {
    if (!this.player) return;
    try {
      this.player.unMute?.();
      this.player.setVolume?.(100);
    } catch {
      /* ignore */
    }
  }

  async load(videoId) {
    await YouTubePlayerController.waitForAPI();

    if (this.player) {
      this.player.loadVideoById(videoId);
      this.videoId = videoId;
      this.enforceMute();
      return;
    }

    this.videoId = videoId;

    await new Promise((resolve) => {
      this.player = new YT.Player(this.containerId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.enforceMute();
            resolve();
          },
          onStateChange: (e) => {
            this.enforceMute();
            this.onStateChange?.(e.data);
          },
        },
      });
    });
  }

  getCurrentTime() {
    return this.player?.getCurrentTime() ?? 0;
  }

  destroy() {
    this.player?.destroy();
    this.player = null;
  }
}
