import { Link } from "@tanstack/react-router";
import { Plus, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type EntrySummary, type Section } from "../lib/api";
import { collectSectionAndDescendantIds, flattenSectionTree } from "../lib/sectionTree";
import { AddEditEntryModal } from "./AddEditEntryModal";
import { EntryCard } from "./EntryCard";
import { Button, Input } from "./ui";

interface VaultViewProps {
  sections: Section[];
  sectionId?: string;
}

interface EntryGroup {
  sectionId: string;
  sectionName: string;
  entries: EntrySummary[];
}

export function VaultView({ sections, sectionId }: VaultViewProps) {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EntrySummary | undefined>(undefined);

  const activeSection = sections.find((s) => s.id === sectionId);
  const sectionsById = useMemo(
    () => new Map(sections.map((s) => [s.id, s.name])),
    [sections],
  );

  const hasNestedSections = Boolean(
    sectionId && sections.some((s) => s.parentId === sectionId),
  );

  const relevantSectionIds = useMemo(
    () => (sectionId ? collectSectionAndDescendantIds(sections, sectionId) : null),
    [sections, sectionId],
  );

  const refreshEntries = useCallback(() => {
    setLoading(true);
    void api
      .listEntries()
      .then(setEntries)
      .catch((error: unknown) => console.error("Не удалось загрузить записи:", error))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshEntries();
  }, [refreshEntries]);

  const scopedEntries = relevantSectionIds
    ? entries.filter((e) => relevantSectionIds.includes(e.sectionId))
    : entries;

  const filtered = scopedEntries.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.link.toLowerCase().includes(q)
    );
  });

  // Если у выбранного раздела есть вложенные разделы — показываем записи,
  // сгруппированные по разделу (включая сам раздел и всех потомков).
  // Иначе — обычный плоский список, как для листового раздела или «Всех паролей».
  const groups: EntryGroup[] | null = hasNestedSections
    ? flattenSectionTree(sections)
        .filter(({ section }) => relevantSectionIds?.includes(section.id))
        .map(({ section }) => ({
          sectionId: section.id,
          sectionName: section.name,
          entries: filtered.filter((e) => e.sectionId === section.id),
        }))
        .filter((group) => group.entries.length > 0)
    : null;

  const openCreate = () => {
    setEditingEntry(undefined);
    setModalOpen(true);
  };

  const openEdit = (entry: EntrySummary) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-foreground flex items-center gap-2 text-xl font-semibold">
            {!activeSection && (
              <Wallet size={20} className="text-primary flex-shrink-0" />
            )}
            <span className="truncate">{activeSection?.name ?? "Все пароли"}</span>
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {filtered.length} {filtered.length === 1 ? "запись" : "записей"}
            {hasNestedSections && " вместе с вложенными разделами"}
          </p>
        </div>
        <Button onClick={openCreate} className="sm:flex-shrink-0">
          <Plus size={16} />
          Добавить пароль
        </Button>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию, ссылке или описанию"
          className="h-9 pl-9"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground py-10 text-center text-sm">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-14 text-center">
          <p className="text-muted-foreground text-sm">
            {scopedEntries.length === 0
              ? "В этом разделе пока нет паролей"
              : "Ничего не найдено"}
          </p>
          {scopedEntries.length === 0 && (
            <Button className="mt-4" variant="secondary" onClick={openCreate}>
              Добавить первый пароль
            </Button>
          )}
        </div>
      ) : groups ? (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.sectionId}>
              <Link
                to="/vault"
                search={{ section: group.sectionId }}
                className="text-muted-foreground hover:text-primary mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"
              >
                {group.sectionName}
                <span className="font-normal normal-case">({group.entries.length})</span>
              </Link>
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    sectionName={sectionsById.get(entry.sectionId) ?? ""}
                    onEdit={() => openEdit(entry)}
                    onDeleted={refreshEntries}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              sectionName={sectionsById.get(entry.sectionId) ?? ""}
              onEdit={() => openEdit(entry)}
              onDeleted={refreshEntries}
            />
          ))}
        </div>
      )}

      <AddEditEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        sections={sections}
        entry={editingEntry}
        initialSectionId={sectionId}
        onSaved={refreshEntries}
      />
    </div>
  );
}
