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
export function formatPitch(semitones) {
  const rounded = Math.round(semitones * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const unit = Math.abs(rounded) === 1 ? 'semitom' : 'semitons';
  return `${sign}${rounded} ${unit}`;
}
