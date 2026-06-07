/**
 * Extrai o ID do vídeo a partir de diversos formatos de URL do YouTube.
 * @param {string} input
 * @returns {string|null}
 */
export function extractVideoId(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Formata semitons para exibição.
 * @param {number} semitones
 */
/** iPhone/iPad — Chrome no iOS usa WebKit (mesmas limitações do Safari). */
export function isIOS() {
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function formatPitch(semitones) {
  const rounded = Math.round(semitones * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const unit = Math.abs(rounded) === 1 ? 'semitom' : 'semitons';
  return `${sign}${rounded} ${unit}`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
