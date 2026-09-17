import { apiClient } from './api-client';

export interface Table {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_at?: string;
  updated_at?: string;
}

// Funciones individuales que retornan la respuesta completa de Axios (para Index.tsx)
export const getTables = () => apiClient.get<Table[]>('/tables/');
export const getTableById = (id: string) => apiClient.get<Table>(`/tables/${id}/`);
export const createTable = (data: any) => apiClient.post<Table>('/tables/', data);
export const updateTable = (id: string, data: any) => apiClient.put<Table>(`/tables/${id}/`, data);
export const deleteTable = (id: string) => apiClient.delete(`/tables/${id}/`);
export const getTabView = (tableId: string, tabId: string) => apiClient.get<any>(`/tables/tabview/${tableId}/${tabId}/`);

// Servicio unificado que retorna los datos directamente (para TableView.tsx y compatibilidad)
export const tableService = {
  getAll: () => getTables().then(res => res.data),
  getById: (id: string) => getTableById(id).then(res => res.data),
  create: (data: Omit<Table, 'id'>) => createTable(data).then(res => res.data),
  update: (id: string, data: Partial<Table>) => updateTable(id, data).then(res => res.data),
  delete: (id: string) => deleteTable(id).then(res => res.data),
  getTabView: (tableId: string, tabId: string) => getTabView(tableId, tabId).then(res => res.data),
};