import { apiClient } from './api-client';

export interface Column {
  id: string;
  table_id: string;
  tab_id: String,
  name: string;
  type: 'text' | 'checkbox' | 'int' | 'float' | 'select';
  options?: string[];
  order: number;
}

export const columnService = {
  getAll: (tableId: string) =>
    apiClient.get<Column[]>(`/tables/${tableId}/columns/`).then(res => res.data),

  create: (tableId: string, data: Omit<Column, 'id'>) =>
    apiClient.post<Column>(`/tables/${tableId}/columns/`, data).then(res => res.data),

  update: (tableId: string, columnId: string, data: Partial<Column>) =>
    apiClient.put<Column>(`/tables/${tableId}/columns/${columnId}/`, data).then(res => res.data),

  delete: (tableId: string, columnId: string) =>
    apiClient.delete(`/tables/${tableId}/columns/${columnId}/`).then(res => res.data),
};
