import { apiClient } from './api-client';

export interface Tab {
  id: string;
  table_id: string;
  name: string;
  label: string;
  order: number;
}

export const tabService = {
  getAll: (tableId: string) =>
    apiClient.get<Tab[]>(`/tables/${tableId}/tabs/`).then(res => res.data),
  
  create: (tableId: string, data: Omit<Tab, 'id'>) =>
    apiClient.post<Tab>(`/tables/${tableId}/tabs/`, data).then(res => res.data),
  
  update: (tableId: string, tabId: string, data: Partial<Tab>) =>
    apiClient.put<Tab>(`/tables/${tableId}/tabs/${tabId}/`, data).then(res => res.data),
  
  delete: (tableId: string, tabId: string) =>
    apiClient.delete(`/tables/${tableId}/tabs/${tabId}/`).then(res => res.data),
};
