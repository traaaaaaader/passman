import { Link, useRouter } from "@tanstack/react-router";
import { ChevronRight, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Section } from "../../lib/api";
import { useSectionActions } from "../../lib/useSectionActions";
import { ConfirmDialog } from "../ConfirmDialog";
import { Input } from "../ui";

interface SectionTreeItemProps {
  section: Section;
  depth: number;
  allSections: Section[];
  activeSectionId?: string;
  onNavigate: () => void;
}

const INDENT_PX = 16;

export function SectionTreeItem({
  section,
  depth,
  allSections,
  activeSectionId,
  onNavigate,
}: SectionTreeItemProps) {
  const { renameSection, deleteSection, createSection } = useSectionActions();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(section.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childDraftName, setChildDraftName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const children = allSections.filter((s) => s.parentId === section.id);
  const isActive = activeSectionId === section.id;

  const commitRename = async () => {
    setEditing(false);
    if (!draftName.trim() || draftName.trim() === section.name) return;
    try {
      await renameSection(section.id, draftName);
    } catch (error) {
      console.error("Не удалось переименовать раздел:", error);
    }
  };

  const commitAddChild = async () => {
    setAddingChild(false);
    if (!childDraftName.trim()) return;
    try {
      await createSection(childDraftName, section.id);
      setChildDraftName("");
      setCollapsed(false);
    } catch (error) {
      console.error("Не удалось создать раздел:", error);
    }
  };

  const confirmDelete = async () => {
    setConfirmingDelete(false);
    try {
      await deleteSection(section.id);
      if (isActive) void router.navigate({ to: "/vault" });
    } catch (error) {
      console.error("Не удалось удалить раздел:", error);
    }
  };

  if (editing) {
    return (
      <li style={{ paddingLeft: depth * INDENT_PX }}>
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          className="border-primary h-9"
        />
      </li>
    );
  }

  return (
    <li>
      <div className="group flex items-center" style={{ paddingLeft: depth * INDENT_PX }}>
        {children.length > 0 ? (
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Развернуть" : "Свернуть"}
            className="text-muted-foreground hover:text-foreground flex-shrink-0 rounded p-0.5"
          >
            <ChevronRight
              size={13}
              className={`transition-transform ${collapsed ? "" : "rotate-90"}`}
            />
          </button>
        ) : (
          <span className="w-[21px] flex-shrink-0" />
        )}
        <Link
          to="/vault"
          search={{ section: section.id }}
          activeOptions={{ exact: true, includeSearch: true }}
          onClick={onNavigate}
          className="text-muted-foreground hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition"
          activeProps={{ className: "active" }}
        >
          <Folder size={15} className="flex-shrink-0" />
          <span className="truncate">{section.name}</span>
        </Link>
        <div className="flex flex-shrink-0 items-center gap-0.5 pr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={() => setAddingChild(true)}
            title="Добавить вложенный раздел"
            className="text-muted-foreground hover:text-primary rounded p-1"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => {
              setDraftName(section.name);
              setEditing(true);
            }}
            title="Переименовать"
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <Pencil size={12} />
          </button>
          {section.id !== "general" && (
            <button
              onClick={() => setConfirmingDelete(true)}
              title="Удалить"
              className="text-muted-foreground hover:text-destructive rounded p-1"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {addingChild && (
        <div style={{ paddingLeft: (depth + 1) * INDENT_PX }} className="mt-0.5">
          <Input
            autoFocus
            value={childDraftName}
            placeholder="Название раздела"
            onChange={(e) => setChildDraftName(e.target.value)}
            onBlur={() => void commitAddChild()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitAddChild();
              if (e.key === "Escape") setAddingChild(false);
            }}
            className="border-primary h-9"
          />
        </div>
      )}

      {!collapsed && children.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <SectionTreeItem
              key={child.id}
              section={child}
              depth={depth + 1}
              allSections={allSections}
              activeSectionId={activeSectionId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить раздел?"
        description={`Раздел «${section.name}» будет удалён.${
          children.length > 0 ? " Вложенные разделы поднимутся на уровень выше." : ""
        } Пароли этого раздела переместятся в ${
          section.parentId ? "родительский раздел" : "«Общие»"
        }.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </li>
  );
}
