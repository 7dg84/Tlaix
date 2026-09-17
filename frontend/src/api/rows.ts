import { apiClient } from './api-client';

export interface Row {
  id: string;
  table_id: string;
  name: string;
  data: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export const rowService = {
  getAll: (tableId: string) => 
    apiClient.get<Row[]>(`/tables/${tableId}/rows/`).then(res => res.data),
  
  create: (tableId: string, arg2: any, arg3?: Record<string, any>) => {
    let dataToSend;
    if (arg3 !== undefined) {
      // Firma antigua: (tableId, nameValue, dataObject)
      dataToSend = {
        name: arg2,
        data: arg3
      };
    } else {
      // Nueva firma: (tableId, { name, data, ... })
      dataToSend = arg2;
    }
    return apiClient.post<Row>(`/tables/${tableId}/rows/`, dataToSend).then(res => res.data);
  },
  
  update: (tableId: string, rowId: string, data: Partial<Row>) =>
    apiClient.put<Row>(`/tables/${tableId}/rows/${rowId}/`, data).then(res => res.data),
    
  delete: (tableId: string, rowId: string) =>
    apiClient.delete(`/tables/${tableId}/rows/${rowId}/`).then(res => res.data),
};
