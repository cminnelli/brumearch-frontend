/**
 * Los archivos subidos (/uploads) ya no son públicos: requieren un token corto
 * que el backend entrega en GET /api/auth/file-token y AuthService mantiene al día.
 * Usar SIEMPRE este helper para armar links, <img src> y backgrounds de archivos.
 */
export const FILE_TOKEN_KEY = 'file_token';

function readToken(): string {
  try { return localStorage.getItem(FILE_TOKEN_KEY) ?? ''; } catch { return ''; }
}

/** Acepta "abc.pdf" o "/uploads/abc.pdf". Las URLs externas (Google, etc.) pasan sin tocar. */
export function fileUrl(pathOrFilename: string | null | undefined): string {
  if (!pathOrFilename) return '';
  if (/^https?:\/\//i.test(pathOrFilename)) return pathOrFilename;
  const path = pathOrFilename.startsWith('/uploads/') ? pathOrFilename : `/uploads/${pathOrFilename}`;
  const t = readToken();
  return t ? `${path}?t=${encodeURIComponent(t)}` : path;
}
