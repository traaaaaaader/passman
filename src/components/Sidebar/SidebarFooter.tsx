import { Link } from "@tanstack/react-router";
import { LogOut, Settings, Share2 } from "lucide-react";
import { useSession } from "../../lib/session";

const navLinkClass =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted [&.active]:bg-accent [&.active]:text-accent-foreground";

export function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  const { lock } = useSession();

  return (
    <div className="border-border border-t p-2">
      <Link
        to="/sync"
        onClick={onNavigate}
        className={navLinkClass}
        activeProps={{ className: "active" }}
      >
        <Share2 size={17} />
        Синхронизация
      </Link>
      <Link
        to="/settings"
        onClick={onNavigate}
        className={navLinkClass}
        activeProps={{ className: "active" }}
      >
        <Settings size={17} />
        Настройки
      </Link>
      <button
        onClick={() =>
          void lock().catch((error: unknown) =>
            console.error("Не удалось заблокировать хранилище:", error),
          )
        }
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition"
      >
        <LogOut size={17} />
        Заблокировать
      </button>
    </div>
  );
}
