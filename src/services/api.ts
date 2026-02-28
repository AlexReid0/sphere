import axios from 'axios';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor — unwrap { success, data } envelope
api.interceptors.response.use(
  (response) => {
    if (response.data?.success === false) {
      return Promise.reject(new Error(response.data.error || 'API error'));
    }
    return response;
  },
  (error) => {
    const message = error.response?.data?.error || error.message || 'Network error';
    console.error('[API]', message);
    return Promise.reject(new Error(message));
  },
);

export default api;
