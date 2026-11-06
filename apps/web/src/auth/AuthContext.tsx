import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUserDto } from "@accounting-timer/shared-types";
import { apiFetch, setAccessToken } from "../api/client";
import { coordinatedRefresh } from "./refreshCoordinator";
import {
  buildLogoutRequestInit,
  buildRefreshRequestInit,
  clearDesktopRefreshToken,
  persistDesktopRefreshToken,
  type AuthPayload,
} from "./sessionTransport";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: AuthUserDto };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const result = await coordinatedRefresh(async () => {
      const init = await buildRefreshRequestInit();
      const payload = await apiFetch<AuthPayload>("/api/v1/auth/refresh", init);
      await persistDesktopRefreshToken(payload.refreshToken);
      return {
        accessToken: payload.accessToken,
        user: payload.user,
      };
    });

    if (!result) {
      setAccessToken(null);
      await clearDesktopRefreshToken();
      setState({ status: "anonymous" });
      return false;
    }

    setAccessToken(result.accessToken);
    setState({
      status: "authenticated",
      user: result.user as AuthUserDto,
    });
    return true;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<AuthPayload>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await persistDesktopRefreshToken(result.refreshToken);
    setAccessToken(result.accessToken);
    setState({ status: "authenticated", user: result.user as AuthUserDto });
  }, []);

  const logout = useCallback(async () => {
    try {
      const init = await buildLogoutRequestInit();
      await apiFetch("/api/v1/auth/logout", init);
    } finally {
      await clearDesktopRefreshToken();
      setAccessToken(null);
      setState({ status: "anonymous" });
    }
  }, []);

  const value = useMemo(
    () => ({ state, login, logout, refresh }),
    [state, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
