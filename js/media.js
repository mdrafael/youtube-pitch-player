export function mediaProxyUrl(streamUrl) {
  return `/api/media?u=${encodeURIComponent(streamUrl)}`;
}
