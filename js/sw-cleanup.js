/** Remove Service Worker legado da v5 que quebrava o proxy de áudio. */
export async function cleanupLegacyServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  } catch {
    /* ignore */
  }
}
