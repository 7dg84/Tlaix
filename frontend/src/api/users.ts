import { apiClient } from './api-client';

export const loginApi = (userData: any) => apiClient.post('/user/login/', userData);
export const registerApi = (userData: any) => apiClient.post('/user/register/', userData);
export const logoutApi = () => apiClient.post('/user/logout/', {});
export const recoverApi = (emailData: any) => apiClient.post('/user/recover/', emailData);
export const getCurrentUser = () => apiClient.get('/user/');