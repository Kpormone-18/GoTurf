import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("goturf_token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("goturf_token"))
      .finally(() => setLoading(false));
  }, []);

  const loginWith = (token, u) => {
    localStorage.setItem("goturf_token", token);
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("goturf_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWith, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
