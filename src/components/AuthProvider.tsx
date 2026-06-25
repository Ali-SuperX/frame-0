"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface AuthState {
  user: string | null;
  role: "admin" | "user" | null;
  userId: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<true | string>;
  register: (username: string, password: string, inviteCode: string) => Promise<true | string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { user?: string; role?: string; userId?: string };
        setUser(j.user ?? null);
        setRole((j.role as "admin" | "user") ?? "user");
        setUserId(j.userId ?? null);
      } else {
        setUser(null);
        setRole(null);
        setUserId(null);
      }
    } catch {
      setUser(null);
      setRole(null);
      setUserId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback<AuthState["login"]>(
    async (username, password) => {
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: string;
          role?: string;
          error?: string;
        };
        if (r.ok && j.ok && j.user) {
          setUser(j.user);
          setRole((j.role as "admin" | "user") ?? "user");
          await refresh();
          return true;
        }
        return j.error || `登录失败 (${r.status})`;
      } catch (e) {
        return e instanceof Error ? e.message : "网络错误";
      }
    },
    [refresh]
  );

  const register = useCallback<AuthState["register"]>(
    async (username, password, inviteCode) => {
      try {
        const r = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, inviteCode }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: string;
          error?: string;
        };
        if (r.ok && j.ok && j.user) {
          setUser(j.user);
          setRole("user");
          await refresh();
          return true;
        }
        return j.error || `注册失败 (${r.status})`;
      } catch (e) {
        return e instanceof Error ? e.message : "网络错误";
      }
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setRole(null);
      setUserId(null);
    }
  }, []);

  return (
    <Ctx.Provider value={{ user, role, userId, loading, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) {
    return {
      user: null,
      role: null,
      userId: null,
      loading: false,
      login: async () => "AuthProvider missing",
      register: async () => "AuthProvider missing",
      logout: async () => {},
      refresh: async () => {},
    };
  }
  return v;
}
