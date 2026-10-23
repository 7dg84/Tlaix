import type { ColumnType } from "@/components/AddColumnDialog";
import type {
  ColumnCellValuesResponse,
  RowCellValuesResponse,
} from "@/api/review";

/** Eje que se recorre en el modo revisión. */
export type ReviewAxis = "row" | "column";

/** Celda concreta que el overlay muestra en cada iteración. */
export interface ReviewItem {
  rowId: string;
  rowName: string;
  columnId: string;
  columnName: string;
  type: ColumnType;
  options?: string[];
  value: unknown;
}

/** Valor local mientras se edita una celda (texto, checkbox o selección). */
export type ReviewDraftValue = string | boolean | null;

/** Minúsculas y sin acentos, para comparar opciones y filtros. */
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Opciones que contienen el filtro como subcadena normalizada. */
export function filterOptions(options: string[], query: string): string[] {
  const list = Array.isArray(options) ? options : [];
  const normalizedQuery = normalizeText(query).trim();
  if (!normalizedQuery) return [...list];
  return list.filter((option) =>
    normalizeText(option).includes(normalizedQuery)
  );
}

/** Convierte la respuesta de fila en la lista ordenada de celdas a revisar. */
export function buildRowReviewItems(
  response: RowCellValuesResponse
): ReviewItem[] {
  return response.items.map((item) => ({
    rowId: response.target.id,
    rowName: response.target.name,
    columnId: item.column_id,
    columnName: item.column_name,
    type: item.type,
    options: Array.isArray(item.options) ? item.options : undefined,
    value: item.value,
  }));
}

/** Convierte la respuesta de columna en la lista ordenada de celdas a revisar. */
export function buildColumnReviewItems(
  response: ColumnCellValuesResponse
): ReviewItem[] {
  return response.items.map((item) => ({
    rowId: item.row_id,
    rowName: item.row_name,
    columnId: response.target.id,
    columnName: response.target.name,
    type: response.target.type,
    options: Array.isArray(response.target.options)
      ? response.target.options
      : undefined,
    value: item.value,
  }));
}

/**
 * Compara dos valores de celda teniendo en cuenta cómo los devuelve la API
 * (booleanos, números, cadenas y null). `undefined` y `null` son equivalentes.
 */
export function isSameValue(a: unknown, b: unknown): boolean {
  const left = a === undefined ? null : a;
  const right = b === undefined ? null : b;

  if (left === right) return true;

  // Una casilla sin valor y una casilla desmarcada son el mismo estado
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }

  if (left === null || right === null) return false;

  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return String(left) === String(right);
    }
    return leftNumber === rightNumber;
  }

  return String(left) === String(right);
}

/**
 * Compara dos valores de una celda según el tipo de columna.
 * En texto, una celda vacía (`null`/`undefined`/`""`) es equivalente a otra vacía.
 */
export function isSameCellValue(
  type: ColumnType,
  a: unknown,
  b: unknown
): boolean {
  if (type === "text") {
    const toText = (value: unknown) =>
      value === null || value === undefined ? "" : String(value);
    return toText(a) === toText(b);
  }
  return isSameValue(a, b);
}

/**
 * Interpreta el buffer numérico de una lista como índice 1-based.
 * Devuelve `null` si el buffer está vacío, no es numérico o queda fuera de rango.
 */
export function parseOptionNumber(
  buffer: string,
  totalOptions: number
): number | null {
  if (!/^\d+$/.test(buffer)) return null;
  const optionNumber = Number.parseInt(buffer, 10);
  if (!Number.isInteger(optionNumber)) return null;
  if (optionNumber < 1 || optionNumber > totalOptions) return null;
  return optionNumber;
}

/** Valor inicial del editor local a partir del valor devuelto por la API. */
export function valueToDraft(
  type: ColumnType,
  value: unknown
): ReviewDraftValue {
  if (type === "checkbox") return Boolean(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Convierte el valor local del editor al valor que espera `PUT /tables/cell/`. */
export function draftToValue(
  type: ColumnType,
  draft: ReviewDraftValue
): unknown {
  switch (type) {
    case "checkbox":
      return Boolean(draft);
    case "int": {
      if (draft === null || draft === undefined) return null;
      const text = String(draft).trim();
      if (text === "") return null;
      // `Number` conserva decimales: la validación de entero vive en el editor
      return Number(text);
    }
    case "float": {
      if (draft === null || draft === undefined) return null;
      const text = String(draft).trim();
      if (text === "") return null;
      return Number(text);
    }
    case "select":
    case "date":
      return draft === null || draft === undefined || draft === "" ? null : String(draft);
    case "text":
    default:
      return draft === null || draft === undefined ? "" : String(draft);
  }
}
