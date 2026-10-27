import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Section } from "./api";

interface SectionsContextValue {
  sections: Section[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const SectionsContext = createContext<SectionsContextValue | null>(null);

export function SectionsProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.listSections();
    setSections(next);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((error: unknown) => console.error("Не удалось загрузить разделы:", error))
      .finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo<SectionsContextValue>(
    () => ({ sections, loading, refresh }),
    [sections, loading, refresh],
  );

  return <SectionsContext.Provider value={value}>{children}</SectionsContext.Provider>;
}

export function useSections(): SectionsContextValue {
  const ctx = useContext(SectionsContext);
  if (!ctx) throw new Error("useSections должен использоваться внутри SectionsProvider");
  return ctx;
}
