import { apiClient } from './api-client';

export interface CellUpdateResponse {
  id: string;
  row_id: string;
  column_id: string;
  value: any;
  created_at: string;
  updated_at: string;
}

export const cellService = {
  // Timeout explícito: si la red falla, el rechazo llega al panel de error del
  // modo revisión en lugar de dejar el overlay bloqueado en "Guardando…".
  update: (tableId: string, columnId: string, rowId: string, value: any) =>
    apiClient
      .put<CellUpdateResponse>(
        `/tables/cell/${tableId}/${columnId}/${rowId}/`,
        { value },
        { timeout: 15000 }
      )
      .then(res => res.data),
};
