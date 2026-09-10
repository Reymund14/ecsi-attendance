import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // { id, full_name, role, token }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("ecsi_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        api.defaults.headers.common["Authorization"] = `Bearer ${parsed.token}`;
      } catch {
        localStorage.removeItem("ecsi_auth");
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (id_number, password) => {
    const { data } = await api.post("/auth/login", { id_number, password });
    const authData = {
      id: data.user_id,
      full_name: data.full_name,
      role: data.role,
      token: data.access_token,
    };
    localStorage.setItem("ecsi_auth", JSON.stringify(authData));
    api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    setUser(authData);
    return authData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ecsi_auth");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
