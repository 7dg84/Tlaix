import axios from 'axios';
import { API_BASE_URL } from './config';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Habilita el envío automático del auth_token en cookies
});
