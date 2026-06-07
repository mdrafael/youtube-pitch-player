export async function mediaProxyUrl(streamUrl) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamUrl }),
    });

    if (res.ok) {
      const { token } = await res.json();
      if (token) return `/api/media?t=${encodeURIComponent(token)}`;
    }
  } catch {
    /* fallback */
  }

  return `/api/media?u=${encodeURIComponent(streamUrl)}`;
}
