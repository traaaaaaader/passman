import { Link } from "@tanstack/react-router";
import { Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { useSections } from "../../lib/sections";
import { useSectionActions } from "../../lib/useSectionActions";
import { Input } from "../ui";
import { SectionTreeItem } from "./SectionTreeItem";

interface SectionNavListProps {
  activeSectionId?: string;
  onNavigate: () => void;
}

export function SectionNavList({ activeSectionId, onNavigate }: SectionNavListProps) {
  const { sections } = useSections();
  const { createSection } = useSectionActions();
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");

  const rootSections = sections.filter((s) => !s.parentId);

  const commitCreate = async () => {
    setAdding(false);
    if (!draftName.trim()) return;
    try {
      await createSection(draftName);
      setDraftName("");
    } catch (error) {
      console.error("Не удалось создать раздел:", error);
    }
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2">
      <Link
        to="/vault"
        search={{ section: undefined }}
        activeOptions={{ exact: true, includeSearch: true }}
        onClick={onNavigate}
        className="text-muted-foreground hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition"
        activeProps={{ className: "active" }}
      >
        <Wallet size={17} />
        Все пароли
      </Link>

      <div className="mt-3 mb-1 flex items-center justify-between px-2.5">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Разделы
        </span>
        <button
          onClick={() => setAdding(true)}
          title="Добавить раздел"
          className="text-muted-foreground hover:bg-muted hover:text-primary rounded p-0.5"
        >
          <Plus size={15} />
        </button>
      </div>

      <ul className="space-y-0.5">
        {rootSections.map((section) => (
          <SectionTreeItem
            key={section.id}
            section={section}
            depth={0}
            allSections={sections}
            activeSectionId={activeSectionId}
            onNavigate={onNavigate}
          />
        ))}

        {adding && (
          <li>
            <Input
              autoFocus
              value={draftName}
              placeholder="Название раздела"
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => void commitCreate()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitCreate();
                if (e.key === "Escape") setAdding(false);
              }}
              className="border-primary h-9"
            />
          </li>
        )}
      </ul>
    </nav>
  );
}
