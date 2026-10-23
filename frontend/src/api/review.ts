import { apiClient } from "./api-client";
import type { ColumnType } from "@/components/AddColumnDialog";

/** Datos mínimos del elemento revisado (fila o columna). */
export interface ReviewTargetSummary {
  id: string;
  name: string;
  order: number;
}

/** Valor de una columna dentro de la fila revisada. */
export interface RowCellValueItem {
  column_id: string;
  column_name: string;
  type: ColumnType;
  options?: string[] | null;
  order: number;
  is_required: boolean;
  value: unknown;
}

/** Respuesta de `GET /tables/<table_id>/rows/<row_id>/cellvalues/`. */
export interface RowCellValuesResponse {
  axis: "row";
  target: ReviewTargetSummary;
  tab: { id: string; name: string; label: string } | null;
  items: RowCellValueItem[];
  total: number;
}

/** Columna revisada, con sus metadatos de tipo. */
export interface ColumnCellTarget extends ReviewTargetSummary {
  type: ColumnType;
  options?: string[] | null;
  is_required: boolean;
  tab_id: string;
}

/** Valor de la columna revisada en una fila. */
export interface ColumnCellValueItem {
  row_id: string;
  row_name: string;
  order: number;
  value: unknown;
}

/** Respuesta de `GET /tables/<table_id>/columns/<column_id>/cellvalues/`. */
export interface ColumnCellValuesResponse {
  axis: "column";
  target: ColumnCellTarget;
  items: ColumnCellValueItem[];
  total: number;
}

export const reviewService = {
  getRowCellValues: (
    tableId: string,
    rowId: string,
    tabId?: string,
    signal?: AbortSignal
  ) =>
    apiClient
      .get<RowCellValuesResponse>(
        `/tables/${tableId}/rows/${rowId}/cellvalues/`,
        {
          params: tabId ? { tab_id: tabId } : undefined,
          signal,
        }
      )
      .then((res) => res.data),

  getColumnCellValues: (
    tableId: string,
    columnId: string,
    signal?: AbortSignal
  ) =>
    apiClient
      .get<ColumnCellValuesResponse>(
        `/tables/${tableId}/columns/${columnId}/cellvalues/`,
        { signal }
      )
      .then((res) => res.data),
};
