import { Link } from "lucide-react";
import { useState } from "react";
import { api, type EntrySummary } from "../../lib/api";
import { copyWithAutoClear } from "../../lib/clipboard";
import { useSettings } from "../../lib/settings";
import { ConfirmDialog } from "../ConfirmDialog";
import { Badge } from "../ui";
import { EntryCardActions } from "./EntryCardActions";

interface EntryCardProps {
  entry: EntrySummary;
  sectionName: string;
  onEdit: () => void;
  onDeleted: () => void;
}

export function EntryCard({ entry, sectionName, onEdit, onDeleted }: EntryCardProps) {
  const { settings } = useSettings();
  const [copyFeedback, setCopyFeedback] = useState<"copied" | "failed" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const copyPassword = async () => {
    try {
      const password = await api.getEntryPassword(entry.id);
      await copyWithAutoClear(password, settings?.clipboardClearSeconds ?? 20);
      setCopyFeedback("copied");
    } catch {
      setCopyFeedback("failed");
    } finally {
      setTimeout(() => setCopyFeedback(null), 1500);
    }
  };

  const confirmDelete = async () => {
    setConfirmingDelete(false);
    try {
      await api.deleteEntry(entry.id);
      onDeleted();
    } catch (error) {
      console.error("Не удалось удалить запись:", error);
    }
  };

  return (
    <div className="group border-border bg-card hover:border-primary/40 relative flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm">
      <div className="bg-accent text-accent-foreground flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
        {entry.name.trim().charAt(0).toUpperCase() || "?"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-foreground truncate text-sm font-medium">{entry.name}</p>
          <Badge variant="secondary">{sectionName}</Badge>
        </div>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
          {entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-primary flex items-center gap-1 truncate"
            >
              <Link size={12} />
              <span className="truncate">{entry.link}</span>
            </a>
          )}
          {entry.description && <span className="truncate">{entry.description}</span>}
        </div>
      </div>

      <EntryCardActions
        onCopy={() => void copyPassword()}
        onEdit={onEdit}
        onDelete={() => setConfirmingDelete(true)}
      />

      {copyFeedback && (
        <span
          className={`absolute top-2 right-2 rounded-md px-2 py-0.5 text-[11px] ${
            copyFeedback === "copied"
              ? "bg-primary text-primary-foreground"
              : "bg-destructive text-destructive-foreground"
          }`}
        >
          {copyFeedback === "copied" ? "Скопировано" : "Не удалось скопировать"}
        </span>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить пароль?"
        description={`Запись «${entry.name}» будет удалена без возможности восстановления.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
