/**
 * URL base da API.
 * Em produção na Vercel, deixe vazio — o vercel.json faz proxy de /api para o Render.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Monta URL completa para endpoints da API. */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
