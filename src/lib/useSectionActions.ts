import { useCallback } from "react";
import { api } from "./api";
import { useSections } from "./sections";
import { sectionNameSchema } from "./validation";

/** CRUD-операции над разделами. Вызывающий код сам решает, что делать с ошибкой валидации. */
export function useSectionActions() {
  const { refresh } = useSections();

  const createSection = useCallback(
    async (rawName: string, parentId: string | null = null) => {
      const name = sectionNameSchema.parse(rawName);
      await api.createSection(name, "primary", parentId);
      await refresh();
    },
    [refresh],
  );

  const renameSection = useCallback(
    async (id: string, rawName: string) => {
      const name = sectionNameSchema.parse(rawName);
      await api.renameSection(id, name);
      await refresh();
    },
    [refresh],
  );

  const deleteSection = useCallback(
    async (id: string) => {
      await api.deleteSection(id);
      await refresh();
    },
    [refresh],
  );

  return { createSection, renameSection, deleteSection };
}
