const LOCAL_UPLOAD_PREFIX = "/api/uploads/";

export function localUploadPath(sha: string, ext: string): string {
  const cleanSha = sha.trim().toLowerCase();
  const cleanExt = ext.trim().replace(/^\./, "").toLowerCase();
  return `${LOCAL_UPLOAD_PREFIX}${cleanSha}.${cleanExt}`;
}

export function normalizeLocalUploadPath(value: string | undefined | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw.startsWith(LOCAL_UPLOAD_PREFIX)) return raw;
  if (raw.startsWith("api/uploads/")) return `/${raw}`;
  try {
    const url = new URL(raw);
    if (url.pathname.startsWith(LOCAL_UPLOAD_PREFIX)) return url.pathname;
  } catch {
    // Keep other source types unchanged so callers can still handle them.
  }
  return raw;
}
