import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Settings } from "./api";
import { useTheme } from "./theme";

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  update: (next: Settings) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  useEffect(() => {
    let active = true;
    void api
      .getSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setTheme(loaded.theme);
      })
      .catch((error: unknown) => console.error("Не удалось загрузить настройки:", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setTheme]);

  const update = useCallback(
    async (next: Settings) => {
      const saved = await api.updateSettings(next);
      setSettings(saved);
      setTheme(saved.theme);
    },
    [setTheme],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, loading, update }),
    [settings, loading, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings должен использоваться внутри SettingsProvider");
  return ctx;
}
