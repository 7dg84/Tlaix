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
  update: (tableId: string, columnId: string, rowId: string, value: any) =>
    apiClient.put<CellUpdateResponse>(`/tables/cell/${tableId}/${columnId}/${rowId}/`, { value }).then(res => res.data),
};
