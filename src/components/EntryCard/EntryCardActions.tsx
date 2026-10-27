import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui";

interface EntryCardActionsProps {
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EntryCardActions({ onCopy, onEdit, onDelete }: EntryCardActionsProps) {
  return (
    <div className="flex flex-shrink-0 items-center gap-1 opacity-100 transition md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onCopy}
        title="Копировать пароль"
        className="text-muted-foreground hover:text-primary"
      >
        <Copy size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onEdit}
        title="Редактировать (пароль можно посмотреть здесь)"
        className="text-muted-foreground hover:text-foreground"
      >
        <Pencil size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        title="Удалить"
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
}
