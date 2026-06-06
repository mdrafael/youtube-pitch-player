/** URL base da API. Em produção, defina VITE_API_URL no painel da Vercel. */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Monta URL completa para endpoints da API. */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}
