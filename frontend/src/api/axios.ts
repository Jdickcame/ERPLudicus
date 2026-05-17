import axios from "axios";

const baseURL = "https://api.ludicuspark.com/api";
//const baseURL = "http://127.0.0.1:8000/api";

const api = axios.create({
  baseURL: baseURL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Solo necesitamos inyectar el token, nada más.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Interceptor simple para cerrar sesión SI el token de 12 horas caduca
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Si falla después de 12 horas, simplemente lo mandamos al login
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
