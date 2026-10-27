import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type VaultStatus } from "./api";

interface SessionContextValue {
  status: VaultStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setupMasterPassword: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.vaultStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((error: unknown) =>
        console.error("Не удалось загрузить статус хранилища:", error),
      )
      .finally(() => setLoading(false));
  }, [refresh]);

  const setupMasterPassword = useCallback(
    async (password: string) => {
      await api.setupMasterPassword(password);
      await refresh();
    },
    [refresh],
  );

  const unlock = useCallback(
    async (password: string) => {
      await api.unlockVault(password);
      await refresh();
    },
    [refresh],
  );

  const lock = useCallback(async () => {
    await api.lockVault();
    await refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({ status, loading, refresh, setupMasterPassword, unlock, lock }),
    [status, loading, refresh, setupMasterPassword, unlock, lock],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession должен использоваться внутри SessionProvider");
  return ctx;
}
