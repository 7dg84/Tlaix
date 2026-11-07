/**
 * Utilidades del renombrado inline. Se mantienen puras para poder probarlas
 * de forma aislada y para compartir la misma decisión en todos los elementos.
 */

/** Recorta el espacio al inicio y al final; conserva los espacios internos. */
export function normalizeRename(value: string): string {
  return value.trim();
}

/** Solo se envía un nombre no vacío y distinto al original (ignorando espacios exteriores). */
export function shouldSubmitRename(previous: string, next: string): boolean {
  const normalized = normalizeRename(next);
  return normalized.length > 0 && normalized !== normalizeRename(previous);
}
