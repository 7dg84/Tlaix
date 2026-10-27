import { format } from "date-fns";
import { es } from "date-fns/locale";

/** Valor que se escribe en el nombre de la columna en cada clic del icono. */
export type DateNameMode = "full" | "day" | "month" | "monthName" | "year";

/** Orden del ciclo: fecha completa → día → mes (número) → mes (nombre) → año. */
export const DATE_NAME_SEQUENCE: DateNameMode[] = [
  "full",
  "day",
  "month",
  "monthName",
  "year",
];

const FORMATS: Record<DateNameMode, string> = {
  full: "yyyy-MM-dd",
  day: "dd",
  month: "MM",
  monthName: "MMMM",
  year: "yyyy",
};

const DESCRIPTIONS: Record<DateNameMode, string> = {
  full: "fecha completa",
  day: "día",
  month: "mes en número",
  monthName: "mes en nombre",
  year: "año",
};

/** Devuelve el modo siguiente del ciclo; si el modo no existe, empieza por la fecha completa. */
export function nextDateNameMode(mode: DateNameMode): DateNameMode {
  const index = DATE_NAME_SEQUENCE.indexOf(mode);
  if (index === -1) return DATE_NAME_SEQUENCE[0];
  return DATE_NAME_SEQUENCE[(index + 1) % DATE_NAME_SEQUENCE.length];
}

/**
 * Devuelve el texto que se escribirá en el campo Nombre de la Columna.
 * - full:      "2026-10-26"
 * - day:       "26"
 * - month:     "10"
 * - monthName: "octubre"
 * - year:      "2026"
 * Usa la fecha local; nunca toISOString().
 */
export function formatDateName(mode: DateNameMode, date: Date): string {
  return format(date, FORMATS[mode], { locale: es });
}

/** Texto para title/aria-label: "Rellenar mes en nombre (octubre)". */
export function describeDateNameMode(mode: DateNameMode, date: Date): string {
  return `Rellenar ${DESCRIPTIONS[mode]} (${formatDateName(mode, date)})`;
}
