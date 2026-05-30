import axios from "axios";

const baseURL = import.meta.env.DEV
  ? "http://127.0.0.1:8000/api"
  : "https://api.ludicuspark.com/api";
// const baseURL = "http://192.168.18.141:8000/api";
// const baseURL = "http://10.253.21.215:8000/api";

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (
        error.config &&
        error.config.url &&
        error.config.url.includes("pos-login")
      ) {
        return Promise.reject(error);
      }

      // Axios solo emite una alarma. El AuthContext la escuchará y hará la navegación.
      window.dispatchEvent(new Event("force_logout"));
    }
    return Promise.reject(error);
  },
);

export default api;
