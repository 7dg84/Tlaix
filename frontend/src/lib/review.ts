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

/** Dirección del orden configurable del modo revisión. */
export type ReviewSortDirection = "asc" | "desc";

/**
 * Criterio de orden: el orden determinista del backend (`original`), el nombre
 * de fila (`row-name`) o el id de cualquier columna de la pestaña.
 */
export type ReviewSortKey = "original" | "row-name" | string;

/** Columna de la pestaña que puede usarse como criterio de orden. */
export interface ReviewColumn {
  id: string;
  name: string;
  type: ColumnType;
}

/** Resultado de búsqueda: el ítem y su índice dentro de la lista ordenada. */
export interface ReviewSearchResult {
  item: ReviewItem;
  index: number;
}

/** Collator español: ignora mayúsculas y acentos y compara números de forma natural. */
const SPANISH_COLLATOR = new Intl.Collator("es", {
  sensitivity: "base",
  numeric: true,
});

/** Una celda sin contenido (`null`, `undefined` o cadena vacía). */
export function isEmptyReviewValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Convierte el valor en número finito; `null` si no representa un número. */
const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Convierte el valor en marca de tiempo; `null` si no es una fecha válida. */
const toTimestamp = (value: unknown): number | null => {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

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

/**
 * Compara dos valores de celda según el tipo de columna, en sentido ascendente.
 * Las celdas vacías (`null`, `undefined`, `""`) quedan siempre al final y un
 * valor no ordenable (número o fecha inválidos) también va después de uno válido.
 */
export function compareReviewValues(
  type: ColumnType,
  a: unknown,
  b: unknown,
  collator: Intl.Collator = SPANISH_COLLATOR
): number {
  const aEmpty = isEmptyReviewValue(a);
  const bEmpty = isEmptyReviewValue(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  switch (type) {
    case "int":
    case "float": {
      const aNumber = toFiniteNumber(a);
      const bNumber = toFiniteNumber(b);
      if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
      // Dos valores no numéricos se comparan como texto; uno válido va primero
      if (aNumber === null && bNumber === null) {
        return collator.compare(String(a), String(b));
      }
      return aNumber === null ? 1 : -1;
    }
    case "date": {
      const aTime = toTimestamp(a);
      const bTime = toTimestamp(b);
      if (aTime !== null && bTime !== null) return aTime - bTime;
      // Dos fechas inválidas se comparan como texto; una válida va primero
      if (aTime === null && bTime === null) {
        return collator.compare(String(a), String(b));
      }
      return aTime === null ? 1 : -1;
    }
    case "checkbox": {
      const aChecked = Boolean(a);
      const bChecked = Boolean(b);
      if (aChecked === bChecked) return 0;
      return aChecked ? 1 : -1;
    }
    case "select":
    case "text":
    default:
      return collator.compare(String(a), String(b));
  }
}

/**
 * Ordena una copia de `items` según el criterio indicado.
 * - Los valores vacíos y los no ordenables (números o fechas inválidos) quedan
 *   al final tanto en ascendente como en descendente.
 * - `desc` invierte solo la comparación de valores; el desempate por nombre de
 *   fila y el orden original se mantienen estables.
 * - `original` devuelve el orden recibido sin tocar el array.
 */
export function sortReviewItems(
  items: ReviewItem[],
  options: {
    sortKey: ReviewSortKey;
    direction: ReviewSortDirection;
    columns: ReviewColumn[];
    /** Valores de la columna de orden, por `row_id`. Solo si `sortKey` es una columna. */
    valuesByRow?: Map<string, unknown>;
  }
): ReviewItem[] {
  const { sortKey, direction, columns, valuesByRow } = options;
  if (sortKey === "original") return [...items];

  const column =
    sortKey === "row-name"
      ? null
      : columns.find((candidate) => candidate.id === sortKey) ?? null;
  const type: ColumnType = column?.type ?? "text";

  const valueOf = (item: ReviewItem): unknown => {
    if (!column) return item.rowName;
    // La columna revisada ya trae su valor en el propio ítem
    if (column.id === item.columnId) return item.value;
    return valuesByRow?.get(item.rowId);
  };

  /** ¿El valor se puede comparar por su tipo (número o fecha válidos)? */
  const isOrderable = (value: unknown): boolean => {
    if (type === "int" || type === "float") return toFiniteNumber(value) !== null;
    if (type === "date") return toTimestamp(value) !== null;
    return true;
  };

  const compareValues = (a: ReviewItem, b: ReviewItem): number => {
    const aValue = valueOf(a);
    const bValue = valueOf(b);
    const aEmpty = isEmptyReviewValue(aValue);
    const bEmpty = isEmptyReviewValue(bValue);

    // Los vacíos van al final en ambas direcciones
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (aEmpty && bEmpty) return 0;

    // Los valores no ordenables también van al final, sin invertir con `desc`
    const aOrderable = isOrderable(aValue);
    const bOrderable = isOrderable(bValue);
    if (aOrderable !== bOrderable) return aOrderable ? -1 : 1;

    const base = compareReviewValues(type, aValue, bValue, SPANISH_COLLATOR);
    if (base === 0) return 0;
    return direction === "desc" ? -base : base;
  };

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byValue = compareValues(left.item, right.item);
      if (byValue !== 0) return byValue;
      // Desempate: nombre de fila con el collator español y, después, orden original
      const byName = SPANISH_COLLATOR.compare(
        left.item.rowName,
        right.item.rowName
      );
      if (byName !== 0) return byName;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

/** Texto legible de un valor de celda para la lista de búsqueda. */
export function formatReviewValue(type: ColumnType, value: unknown): string {
  if (isEmptyReviewValue(value)) return "—";
  if (type === "checkbox") return value ? "Sí" : "No";
  return String(value);
}

/**
 * Filtra por subcadena normalizada el nombre de fila y el valor formateado de la
 * celda. Sin consulta devuelve todos los ítems conservando su índice original.
 */
export function searchReviewItems(
  items: ReviewItem[],
  query: string
): ReviewSearchResult[] {
  const normalizedQuery = normalizeText(query).trim();

  return items.reduce<ReviewSearchResult[]>((results, item, index) => {
    if (!normalizedQuery) {
      results.push({ item, index });
      return results;
    }
    const haystack = `${normalizeText(item.rowName)}\n${normalizeText(
      formatReviewValue(item.type, item.value)
    )}`;
    if (haystack.includes(normalizedQuery)) {
      results.push({ item, index });
    }
    return results;
  }, []);
}
