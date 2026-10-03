import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("goturf_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("goturf_token");
      window.dispatchEvent(new Event("goturf-auth-expired"));
    }
    return Promise.reject(error);
  },
);

export const getToken = () => localStorage.getItem("goturf_token");

// Build an authenticated file URL for <img src> (object-storage files served by backend).
export const fileUrl = (path) => `${API}/files/${path}?auth=${encodeURIComponent(getToken() || "")}`;

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const ghs = (n) =>
  `₵ ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
